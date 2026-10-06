import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  filter,
  header,
  openOptions,
  openPopup,
  profile,
  readProfiles,
  readStorage,
  reloadExtensionPage,
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
    await reloadExtensionPage(page);

    await expect(page.locator('.logo')).toContainText('NoobHeaders');
    await expect(page.locator('#global-enabled')).toBeAttached();
    await expect(page.locator('.profile-row')).toHaveCount(1);
    await expect(page.locator('#tab-headers')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#add-header-btn')).toBeVisible();
    await expect(page.locator('#add-filter-btn')).toBeHidden();
    // The debug panel lives in the options page
    await expect(page.locator('#debug-content')).toHaveCount(0);
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

    await reloadExtensionPage(page);
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

  test('animations are turned off when the system asks for reduced motion', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    const rowTransition = () =>
      page
        .locator('.profile-row')
        .first()
        .evaluate((row) => Number.parseFloat(getComputedStyle(row).transitionDuration));

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    expect(await rowTransition()).toBeGreaterThan(0.1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await rowTransition()).toBeLessThan(0.001);
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
    await reloadExtensionPage(page);
    await expect(page.locator('body')).toHaveClass(/noob-mode/);
  });
});

test.describe('Popup: headers and filters tabs', () => {
  test('tabs show the headers or the filters, with their counts', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [
        profile('Work', {
          headers: [header('X-A', '1'), header('X-B', '2'), header('X-C', '3')],
          filters: [filter('example.com')],
        }),
        profile('Empty'),
      ],
    });

    const headersTab = page.locator('#tab-headers');
    const filtersTab = page.locator('#tab-filters');
    await expect(page.locator('#headers-count')).toHaveText('3');
    await expect(page.locator('#filters-count')).toHaveText('1');
    await expect(page.locator('#panel-headers')).toBeVisible();
    await expect(page.locator('#panel-filters')).toBeHidden();
    await expect(page.locator('.header-item')).toHaveCount(3);

    await filtersTab.click();
    await expect(filtersTab).toHaveAttribute('aria-selected', 'true');
    await expect(headersTab).toHaveAttribute('aria-selected', 'false');
    await expect(page.locator('#panel-filters')).toBeVisible();
    await expect(page.locator('#panel-headers')).toBeHidden();
    await expect(page.locator('#add-filter-btn')).toBeVisible();
    await expect(page.locator('#add-header-btn')).toBeHidden();
    await expect(page.locator('.filter-item')).toHaveCount(1);

    // The counts follow the selected profile
    await page.getByRole('button', { name: 'Empty', exact: true }).click();
    await expect(page.locator('#headers-count')).toHaveText('0');
    await expect(page.locator('#filters-count')).toHaveText('0');
    // The tab stays the same when another profile is selected
    await expect(page.locator('#empty-filters')).toBeVisible();

    // The empty state button adds a filter and focuses it
    await page.click('#empty-add-filter-btn');
    await expect(page.locator('.filter-item .filter-value')).toBeFocused();
    await expect(page.locator('#filters-count')).toHaveText('1');

    // The selected tab is remembered when the popup opens again
    await reloadExtensionPage(page);
    await expect(page.locator('#tab-filters')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#panel-filters')).toBeVisible();
  });

  test('tabs follow the ARIA keyboard pattern', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });

    const headersTab = page.locator('#tab-headers');
    const filtersTab = page.locator('#tab-filters');
    await expect(headersTab).toHaveAttribute('tabindex', '0');
    await expect(filtersTab).toHaveAttribute('tabindex', '-1');
    await expect(page.locator('#panel-headers')).toHaveAttribute('role', 'tabpanel');

    await headersTab.focus();
    await page.keyboard.press('ArrowRight');
    await expect(filtersTab).toBeFocused();
    await expect(filtersTab).toHaveAttribute('aria-selected', 'true');
    await expect(filtersTab).toHaveAttribute('tabindex', '0');

    await page.keyboard.press('ArrowRight');
    await expect(headersTab).toBeFocused();
    await page.keyboard.press('End');
    await expect(filtersTab).toBeFocused();
    await page.keyboard.press('Home');
    await expect(headersTab).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(filtersTab).toBeFocused();
    await expect(page.locator('#panel-filters')).toBeVisible();
  });

  test('the empty headers state has an add button', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });

    await expect(page.locator('#empty-headers')).toBeVisible();
    await page.click('#empty-add-header-btn');
    await expect(page.locator('.header-item .header-name')).toBeFocused();
    await expect(page.locator('#empty-headers')).toBeHidden();
    await expect(page.locator('#headers-count')).toHaveText('1');
  });
});

test.describe('Popup: changes made elsewhere while typing', () => {
  async function writeStorage(page: Page, values: Record<string, unknown>, clear = false) {
    await page.evaluate(
      async ({ items, clearFirst }) => {
        const runtime = globalThis as any;
        const storage = (runtime.browser ?? runtime.chrome).storage.local;
        if (clearFirst) await storage.clear();
        await storage.set(items);
      },
      { items: values, clearFirst: clear }
    );
  }

  test('the global switch changed by the shortcut is kept with the typed edit', async ({
    context,
    extensionOrigin,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work', { headers: [header('', '')] })],
      globalEnabled: false,
    });
    const other = await openOptions(context, extensionOrigin);

    // Type, then switch the header modification on elsewhere before the save
    await popup.locator('.header-name').fill('X-Typed');
    await writeStorage(other, { [STORAGE_KEYS.globalEnabled]: true });

    await expect(popup.locator('#global-enabled')).toBeChecked();
    await expect.poll(async () => (await readProfiles(popup))[0].headers?.[0].name).toBe('X-Typed');
    await popup.waitForTimeout(800);
    const storage = await readStorage(popup);
    expect(storage[STORAGE_KEYS.globalEnabled]).toBe(true);
    expect(storage[STORAGE_KEYS.profiles][0].headers[0].name).toBe('X-Typed');
  });

  test('profiles replaced elsewhere are not overwritten by a pending edit', async ({
    context,
    extensionOrigin,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work', { headers: [header('', '')] })],
      globalEnabled: true,
    });
    const other = await openOptions(context, extensionOrigin);

    // Type, then reset the data elsewhere before the save
    await popup.locator('.header-name').fill('X-Lost');
    await writeStorage(
      other,
      {
        [STORAGE_KEYS.profiles]: [profile('Fresh')],
        [STORAGE_KEYS.activeProfile]: 'Fresh',
        [STORAGE_KEYS.globalEnabled]: false,
      },
      true
    );

    await expect(popup.locator('.profile-row')).toHaveCount(1);
    await expect(popup.locator('#active-profile-name')).toHaveText('Fresh');
    // Longer than the save delay: the old profiles are not written back
    await popup.waitForTimeout(800);
    expect((await readProfiles(popup)).map((p) => p.name)).toEqual(['Fresh']);
    expect((await readStorage(popup))[STORAGE_KEYS.globalEnabled]).toBe(false);
    await expect(popup.locator('#global-enabled')).not.toBeChecked();
  });

  test('the popup own saves never undo the edit being typed', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { headers: [header('', '')] })] });

    const name = page.locator('.header-name');
    await name.click();
    // Typing slower than the save delay: each save happens while more is typed
    await name.pressSequentially('X-Very-Long-Header-Name', { delay: 120 });
    await expect(name).toHaveValue('X-Very-Long-Header-Name');
    await expect
      .poll(async () => (await readProfiles(page))[0].headers?.[0].name)
      .toBe('X-Very-Long-Header-Name');
  });
});
