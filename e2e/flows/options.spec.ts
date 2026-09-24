import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '../fixtures';
import {
  answerPrompt,
  header,
  openOptions,
  openPopup,
  profile,
  readProfiles,
  readStorage,
  STORAGE_KEYS,
  seedState,
  setToggle,
} from '../helpers';

let tmpDir: string;

test.beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'noobheaders-e2e-'));
});

test.afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true });
});

async function writeJson(name: string, data: unknown): Promise<string> {
  const filePath = path.join(tmpDir, name);
  await writeFile(filePath, typeof data === 'string' ? data : JSON.stringify(data));
  return filePath;
}

test.describe('Options page', () => {
  test('settings toggles are usable and persisted', async ({ context, extensionOrigin }) => {
    const options = await openOptions(context, extensionOrigin);
    await seedState(options, { profiles: [profile('Work')] });

    const badge = options.locator('#show-badge');
    await expect(badge).toBeEnabled();
    await expect(badge).toBeChecked();
    await setToggle(options.locator('label:has(#show-badge)'), false);
    await expect.poll(async () => (await readStorage(options)).showBadge).toBe(false);

    await setToggle(options.locator('label:has(#auto-enable)'), true);
    await expect.poll(async () => (await readStorage(options)).autoEnable).toBe(true);

    await options.reload();
    await expect(options.locator('#show-badge')).not.toBeChecked();
    await expect(options.locator('#auto-enable')).toBeChecked();
  });

  test('auto-enable switches new profiles on', async ({ context, extensionOrigin }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, { profiles: [profile('Work')], extra: { autoEnable: true } });

    await popup.click('#add-profile-btn');
    await answerPrompt(popup, 'Auto');
    await expect(popup.locator('#active-profile-name')).toHaveText('Auto');
    await expect(popup.locator('#profile-disabled-hint')).toBeHidden();
    await expect.poll(async () => (await readProfiles(popup))[1]?.enabled).toBe(true);
  });

  test('export downloads every profile as JSON', async ({ context, extensionOrigin }) => {
    const options = await openOptions(context, extensionOrigin);
    await seedState(options, {
      profiles: [profile('Work', { headers: [header('X-Export', '1')] }), profile('Other')],
    });

    const downloadPromise = options.waitForEvent('download');
    await options.click('#export-profiles-btn');
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^noobheaders-profiles-.*\.json$/);

    const exported = JSON.parse(await readFile(await download.path(), 'utf-8'));
    expect(exported.map((p: { name: string }) => p.name)).toEqual(['Work', 'Other']);
    expect(exported[0].headers[0]).toMatchObject({ name: 'X-Export', value: '1' });
    await expect(options.locator('.toast.success')).toBeVisible();
  });

  test('import replaces the profiles and updates an open popup', async ({
    context,
    extensionOrigin,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, { profiles: [profile('Old')] });
    const options = await openOptions(context, extensionOrigin);

    const file = await writeJson('profiles.json', [
      { id: 'a', name: 'Imported A', enabled: true, headers: [header('X-A', '1')], filters: [] },
      // Missing id and duplicate-free: an id is generated
      { name: 'Imported B', headers: [], filters: [] },
    ]);
    await options.locator('#import-profiles-input').setInputFiles(file);
    await expect(options.locator('#confirm-message')).toContainText('2');
    await options.click('#confirm-ok');
    await expect(options.locator('.toast.success')).toBeVisible();

    const storage = await readStorage(options);
    const profiles = storage[STORAGE_KEYS.profiles];
    expect(profiles.map((p: { name: string }) => p.name)).toEqual(['Imported A', 'Imported B']);
    expect(typeof profiles[1].id).toBe('string');
    expect(storage[STORAGE_KEYS.activeProfile]).toBe('a');

    await expect(popup.locator('.profile-row')).toHaveCount(2);
    await expect(popup.locator('#active-profile-name')).toHaveText('Imported A');
  });

  test('cancelling the import keeps the current profiles', async ({ context, extensionOrigin }) => {
    const options = await openOptions(context, extensionOrigin);
    await seedState(options, { profiles: [profile('Keep me')] });

    const file = await writeJson('profiles.json', [{ name: 'New', headers: [], filters: [] }]);
    await options.locator('#import-profiles-input').setInputFiles(file);
    await expect(options.locator('#confirm-modal')).toBeVisible();
    await options.keyboard.press('Escape');
    await expect(options.locator('#confirm-modal')).toHaveCount(0);

    expect((await readProfiles(options)).map((p) => p.name)).toEqual(['Keep me']);
  });

  test('invalid files are rejected, and the same file can be picked again', async ({
    context,
    extensionOrigin,
  }) => {
    const options = await openOptions(context, extensionOrigin);
    await seedState(options, { profiles: [profile('Keep me')] });
    const input = options.locator('#import-profiles-input');

    const notJson = await writeJson('broken.json', '{ not json');
    await input.setInputFiles(notJson);
    await expect(options.locator('.toast.error')).toHaveCount(1);

    await input.setInputFiles(notJson);
    await expect(options.locator('.toast.error')).toHaveCount(2);

    await input.setInputFiles(await writeJson('object.json', { profiles: [] }));
    await expect(options.locator('.toast.error')).toHaveCount(3);

    await input.setInputFiles(
      await writeJson('missing-name.json', [{ id: 'x', headers: [], filters: [] }])
    );
    await expect(options.locator('.toast.error')).toHaveCount(4);

    await input.setInputFiles(await writeJson('empty.json', []));
    await expect(options.locator('.toast.error')).toHaveCount(5);

    expect((await readProfiles(options)).map((p) => p.name)).toEqual(['Keep me']);
  });
});
