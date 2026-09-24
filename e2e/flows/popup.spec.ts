import { readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import {
  header,
  openPopup,
  profile,
  readProfiles,
  readStorage,
  STORAGE_KEYS,
  seedState,
  setGlobalEnabled,
  trackPageErrors,
} from '../helpers';

const manifest = JSON.parse(readFileSync('manifest.json', 'utf-8'));

test.describe('Popup: layout and global switch', () => {
  test('renders every section without JavaScript errors', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    const errors = trackPageErrors(page);
    await page.reload();
    await page.locator('body[data-ready="true"]').waitFor();

    await expect(page.locator('.logo')).toContainText('NoobHeaders');
    await expect(page.locator('#global-enabled')).toBeAttached();
    await expect(page.locator('.profile-row')).toHaveCount(1);
    await expect(page.locator('#add-header-btn')).toBeVisible();
    await expect(page.locator('#add-filter-btn')).toBeVisible();
    await expect(page.locator('#easter-egg-trigger')).toHaveText(`v${manifest.version}`);
    expect(errors).toEqual([]);
  });

  test('first launch creates the demo profile, switched off', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    const profiles = await readProfiles(page);

    expect(profiles).toHaveLength(1);
    expect(profiles[0].enabled).toBe(false);
    await expect(page.locator('#active-profile-name')).toHaveText(profiles[0].name);
    await expect(page.locator('#profile-disabled-hint')).toBeVisible();
    await expect(page.locator('#global-disabled-hint')).toBeVisible();
  });

  test('global switch persists and hides the "disabled" hint', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')], globalEnabled: false });

    await setGlobalEnabled(page, true);
    await expect(page.locator('#global-disabled-hint')).toBeHidden();

    await page.reload();
    await expect(page.locator('#global-enabled')).toBeChecked();

    await setGlobalEnabled(page, false);
    await expect(page.locator('#global-disabled-hint')).toBeVisible();
  });

  test('toggles can be operated with the keyboard', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { enabled: false })] });

    await page.locator('#global-enabled').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#global-enabled')).toBeChecked();

    const profileToggle = page.locator('.profile-row input[type="checkbox"]');
    await profileToggle.focus();
    await page.keyboard.press('Space');
    await expect(profileToggle).toBeChecked();
    await expect.poll(async () => (await readProfiles(page))[0].enabled).toBe(true);
  });

  test('debug panel shows the live rule state', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work', { headers: [header('X-Debug', '1'), header('X-Two', '2')] })],
      globalEnabled: true,
    });

    const toggle = page.locator('#toggle-debug-btn');
    await expect(page.locator('#debug-content')).toBeHidden();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#debug-content')).toBeVisible();
    await expect(page.locator('#debug-rules-count')).toHaveText('2');
    await expect(page.locator('#debug-active-profile')).toHaveText('Work');
    await expect(page.locator('#debug-rule-sync')).not.toContainText('ERR');

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#debug-content')).toBeHidden();
  });

  test('clear all data asks for confirmation and resets to the demo profile', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work'), profile('Staging')],
      globalEnabled: true,
    });

    await page.click('#toggle-debug-btn');
    await page.click('#clear-all-btn');
    await expect(page.locator('#confirm-modal')).toBeVisible();
    await page.click('#confirm-cancel');
    await expect(page.locator('#confirm-modal')).toBeHidden();
    expect(await readProfiles(page)).toHaveLength(2);

    await page.click('#clear-all-btn');
    await page.click('#confirm-ok');
    await expect(page.locator('.toast.success')).toBeVisible();
    await expect(page.locator('.profile-row')).toHaveCount(1);
    await expect(page.locator('#global-enabled')).not.toBeChecked();

    const storage = await readStorage(page);
    expect(storage[STORAGE_KEYS.profiles]).toHaveLength(1);
    expect(storage[STORAGE_KEYS.globalEnabled]).toBe(false);
  });

  test('easter egg unlocks noob mode after three clicks on the version', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    const version = page.locator('#easter-egg-trigger');

    await version.click();
    await version.click();
    await expect(page.locator('body')).not.toHaveClass(/noob-mode/);
    await version.click();
    await expect(page.locator('body')).toHaveClass(/noob-mode/);

    // Survives a reload (stored with an expiry date)
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/noob-mode/);
  });
});
