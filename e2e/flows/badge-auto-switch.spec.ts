import { expect, test } from '../fixtures';
import {
  filter,
  header,
  openPopup,
  profile,
  readActiveProfileId,
  readBadgeText,
  seedState,
} from '../helpers';

test.describe('Toolbar badge', () => {
  test('counts the headers that apply to the active tab', async ({
    context,
    extensionOrigin,
    testServerUrl,
    altServerUrl,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Scoped', {
          headers: [header('X-A', '1'), header('X-B', '2'), header('Bad Name', 'x')],
          filters: [filter('localhost')],
        }),
      ],
      globalEnabled: true,
    });

    const tab = await context.newPage();
    await tab.goto(`${testServerUrl}/page`);
    await tab.bringToFront();
    await expect.poll(() => readBadgeText(popup)).toBe('2');

    const otherTab = await context.newPage();
    await otherTab.goto(`${altServerUrl}/page`);
    await otherTab.bringToFront();
    await expect.poll(() => readBadgeText(popup)).toBe('');

    // Switching back to the first tab refreshes the badge
    await tab.bringToFront();
    await expect.poll(() => readBadgeText(popup)).toBe('2');
  });

  test('is hidden when disabled globally or in the options', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work', { headers: [header('X-A', '1')] })],
      globalEnabled: true,
    });

    const tab = await context.newPage();
    await tab.goto(`${testServerUrl}/page`);
    await tab.bringToFront();
    await expect.poll(() => readBadgeText(popup)).toBe('1');

    await popup.evaluate(async () => {
      const runtime = globalThis as any;
      const api = runtime.browser ?? runtime.chrome;
      await api.storage.local.set({ showBadge: false });
    });
    await expect.poll(() => readBadgeText(popup)).toBe('');

    await popup.evaluate(async () => {
      const runtime = globalThis as any;
      const api = runtime.browser ?? runtime.chrome;
      await api.storage.local.set({ showBadge: true, noobheaders_global_enabled: false });
    });
    await expect.poll(() => readBadgeText(popup)).toBe('');
  });
});

test.describe('Automatic profile selection', () => {
  test('selects the enabled profile whose filters match the visited site', async ({
    context,
    extensionOrigin,
    testServerUrl,
    altServerUrl,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Default', { headers: [header('X-Default', '1')] }),
        profile('Disabled local', { enabled: false, filters: [filter('127.0.0.1')] }),
        profile('Local', { filters: [filter('localhost')] }),
      ],
      activeProfileId: 'Default',
      globalEnabled: true,
    });

    // Only a disabled profile matches 127.0.0.1: the selection does not change
    const alt = await context.newPage();
    await alt.goto(`${altServerUrl}/page`);
    await alt.bringToFront();
    await alt.waitForTimeout(500);
    expect(await readActiveProfileId(popup)).toBe('Default');

    const local = await context.newPage();
    await local.goto(`${testServerUrl}/page`);
    await local.bringToFront();
    await expect.poll(() => readActiveProfileId(popup)).toBe('Local');
    await expect(popup.locator('#active-profile-name')).toHaveText('Local');
  });

  test('does nothing while header modification is off', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Default'), profile('Local', { filters: [filter('localhost')] })],
      activeProfileId: 'Default',
      globalEnabled: false,
    });

    const local = await context.newPage();
    await local.goto(`${testServerUrl}/page`);
    await local.bringToFront();
    await local.waitForTimeout(800);
    expect(await readActiveProfileId(popup)).toBe('Default');
  });
});
