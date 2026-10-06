import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  answerPrompt,
  header,
  openOptions,
  openPopup,
  profile,
  readProfiles,
  readStorage,
  reloadExtensionPage,
  STORAGE_KEYS,
  seedState,
  setToggle,
} from '../helpers';

async function setStorageValues(page: Page, values: Record<string, unknown>): Promise<void> {
  await page.evaluate(async (items) => {
    const runtime = globalThis as any;
    await (runtime.browser ?? runtime.chrome).storage.local.set(items);
  }, values);
}

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

    await reloadExtensionPage(options);
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

  test('debug panel shows the live rule state', async ({ context, extensionOrigin }) => {
    const options = await openOptions(context, extensionOrigin);
    await seedState(options, {
      profiles: [profile('Work', { headers: [header('X-Debug', '1'), header('X-Two', '2')] })],
      globalEnabled: true,
    });

    await expect(options.locator('#debug-content')).toBeVisible();
    // Refreshed after the storage change, without reloading the page
    await expect(options.locator('#debug-rules-count')).toHaveText('2');
    await expect(options.locator('#debug-active-profile')).toHaveText('Work');
    await expect(options.locator('#debug-global-enabled')).toHaveText('Yes');
    await expect(options.locator('#debug-rule-sync')).not.toContainText('ERR');
    await expect(options.locator('#debug-rules-preview')).toContainText('X-Debug');

    await setStorageValues(options, { [STORAGE_KEYS.globalEnabled]: false });
    await expect(options.locator('#debug-rules-count')).toHaveText('0');
    await expect(options.locator('#debug-global-enabled')).toHaveText('No');

    await options.click('#refresh-debug-btn');
    await expect(options.locator('#debug-rules-count')).toHaveText('0');
  });

  test('clear all data asks for confirmation and resets to the demo profile', async ({
    context,
    extensionOrigin,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work'), profile('Staging')],
      globalEnabled: true,
      extra: { autoEnable: true },
    });
    const options = await openOptions(context, extensionOrigin);

    await options.click('#clear-all-btn');
    await expect(options.locator('#confirm-modal')).toBeVisible();
    // Destructive action: the safe choice is focused
    await expect(options.locator('#confirm-cancel')).toBeFocused();
    await options.click('#confirm-cancel');
    await expect(options.locator('#confirm-modal')).toHaveCount(0);
    expect(await readProfiles(options)).toHaveLength(2);

    await options.click('#clear-all-btn');
    await options.click('#confirm-ok');
    await expect(options.locator('.toast.success')).toBeVisible();

    const storage = await readStorage(options);
    expect(storage[STORAGE_KEYS.profiles]).toHaveLength(1);
    expect(storage[STORAGE_KEYS.profiles][0].enabled).toBe(false);
    expect(storage[STORAGE_KEYS.globalEnabled]).toBe(false);
    expect(storage.autoEnable).toBeUndefined();
    await expect(options.locator('#auto-enable')).not.toBeChecked();

    // An open popup follows
    await expect(popup.locator('.profile-row')).toHaveCount(1);
    await expect(popup.locator('#global-enabled')).not.toBeChecked();
  });

  test('shows the keyboard shortcut of the header modification switch', async ({
    context,
    extensionOrigin,
  }) => {
    const options = await openOptions(context, extensionOrigin);
    await expect(options.locator('#shortcut-value')).toHaveText('Alt+Shift+H');
  });

  test('importing without name clash only says how many were added', async ({
    context,
    extensionOrigin,
  }) => {
    const options = await openOptions(context, extensionOrigin);
    await seedState(options, { profiles: [profile('Work')] });

    const file = await writeJson('profiles.json', [{ name: 'Local', headers: [], filters: [] }]);
    await options.locator('#import-profiles-input').setInputFiles(file);
    await options.click('#import-merge');
    await expect(options.locator('.toast.success')).toHaveText('1 profile(s) added');
  });

  test('the popup exports the selected profile only', async ({ context, extensionOrigin }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Work'),
        profile('Staging API', { headers: [header('X-Stage', '1')], filters: [] }),
      ],
      activeProfileId: 'Staging API',
    });

    // The options page opens and downloads the file (a popup cannot download reliably)
    const optionsPromise = context.waitForEvent('page');
    await popup.click('#export-profile-btn');
    const options = await optionsPromise;
    const download = await options.waitForEvent('download');
    expect(download.suggestedFilename()).toMatch(/^noobheaders-profile-staging-api-.*\.json$/);
    const exported = JSON.parse(await readFile(await download.path(), 'utf-8'));
    expect(exported).toHaveLength(1);
    expect(exported[0]).toMatchObject({ name: 'Staging API', headers: [{ name: 'X-Stage' }] });
    await expect(options.locator('.toast.success')).toHaveText('Profile "Staging API" exported');

    // The request is consumed
    expect((await readStorage(options)).pendingAction).toBeUndefined();

    // With the options page already open, it exports again without reloading
    await popup.getByRole('button', { name: 'Work', exact: true }).click();
    const secondDownload = options.waitForEvent('download');
    await popup.click('#export-profile-btn');
    const second = JSON.parse(await readFile(await (await secondDownload).path(), 'utf-8'));
    expect(second.map((p: { name: string }) => p.name)).toEqual(['Work']);

    // The exported file can be imported again
    const file = await writeJson('profile.json', exported);
    await options.locator('#import-profiles-input').setInputFiles(file);
    await options.click('#import-merge');
    await expect(options.locator('.toast.success').last()).toHaveText(
      '1 profile(s) added, 1 renamed to keep names unique'
    );
    expect((await readProfiles(options)).map((p) => p.name)).toEqual([
      'Work',
      'Staging API',
      'Staging API (2)',
    ]);
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
    // Adding (non-destructive) is the default choice
    await expect(options.locator('#import-merge')).toBeFocused();
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

  test('import can add the profiles to the existing ones', async ({ context, extensionOrigin }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work'), profile('Staging')],
      activeProfileId: 'Staging',
    });
    const options = await openOptions(context, extensionOrigin);

    const file = await writeJson('profiles.json', [
      // Same id and name as an existing profile: both are made unique
      { id: 'Work', name: 'work', headers: [header('X-New', '1')], filters: [] },
      { name: 'Local', headers: [], filters: [] },
    ]);
    await options.locator('#import-profiles-input').setInputFiles(file);

    // Keyboard: the focus stays in the dialog, and comes back to it from outside the buttons
    await expect(options.locator('#import-merge')).toBeFocused();
    await options.keyboard.press('Tab');
    await expect(options.locator('#confirm-cancel')).toBeFocused();
    await options.keyboard.press('Shift+Tab');
    await expect(options.locator('#import-merge')).toBeFocused();
    await options.locator('#confirm-message').click();
    await options.keyboard.press('Shift+Tab');
    await expect(options.locator('#import-merge')).toBeFocused();
    await options.locator('#confirm-message').click();
    await options.keyboard.press('Tab');
    await expect(options.locator('#confirm-cancel')).toBeFocused();

    await options.click('#import-merge');
    await expect(options.locator('.toast.success')).toHaveText(
      '2 profile(s) added, 1 renamed to keep names unique'
    );

    const storage = await readStorage(options);
    const profiles = storage[STORAGE_KEYS.profiles];
    expect(profiles.map((p: { name: string }) => p.name)).toEqual([
      'Work',
      'Staging',
      'work (2)',
      'Local',
    ]);
    expect(new Set(profiles.map((p: { id: string }) => p.id)).size).toBe(4);
    expect(profiles[0].headers).toEqual([]);
    // The selection is kept
    expect(storage[STORAGE_KEYS.activeProfile]).toBe('Staging');

    await expect(popup.locator('.profile-row')).toHaveCount(4);
    await expect(popup.locator('#active-profile-name')).toHaveText('Staging');
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
