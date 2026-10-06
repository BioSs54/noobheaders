import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures';
import {
  filter,
  header,
  openPopup,
  profile,
  profileRow,
  readActiveProfileId,
  readBadgeText,
  seedState,
  setGlobalEnabled,
  setProfileEnabled,
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

test.describe('Popup: profiles applying to the active tab', () => {
  test('marks the enabled profiles whose headers apply to the active tab', async ({
    context,
    extensionOrigin,
    testServerUrl,
    altServerUrl,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Scoped', { headers: [header('X-A', '1')], filters: [filter('localhost')] }),
        profile('Everywhere', { headers: [header('X-B', '1')] }),
        profile('Off', { enabled: false, headers: [header('X-C', '1')] }),
        profile('No headers'),
        profile('Bad header only', { headers: [header('Bad Name', '1')] }),
      ],
      globalEnabled: true,
    });
    const marker = (name: string) => profileRow(popup, name).locator('.profile-applies');

    // The active tab is the extension page itself: nothing applies to it
    for (const name of ['Scoped', 'Everywhere', 'Off', 'No headers', 'Bad header only']) {
      await expect(marker(name)).toBeHidden();
    }

    const tab = await context.newPage();
    await tab.goto(`${testServerUrl}/page`);
    await tab.bringToFront();
    await expect(marker('Scoped')).toBeVisible();
    await expect(marker('Scoped')).toHaveText('Applies to this tab');
    await expect(marker('Everywhere')).toBeVisible();
    await expect(marker('Off')).toBeHidden();
    await expect(marker('No headers')).toBeHidden();
    await expect(marker('Bad header only')).toBeHidden();

    // Another site: only the profile without filters applies
    const other = await context.newPage();
    await other.goto(`${altServerUrl}/page`);
    await other.bringToFront();
    await expect(marker('Scoped')).toBeHidden();
    await expect(marker('Everywhere')).toBeVisible();

    // Navigating the active tab updates the markers
    await other.goto(`${testServerUrl}/page`);
    await expect(marker('Scoped')).toBeVisible();

    // Switching the header modification off hides every marker
    await setGlobalEnabled(popup, false);
    await expect(marker('Scoped')).toBeHidden();
    await expect(marker('Everywhere')).toBeHidden();
    await setGlobalEnabled(popup, true);
    await expect(marker('Everywhere')).toBeVisible();

    // Switching a profile off hides its marker
    await setProfileEnabled(popup, 'Everywhere', false);
    await expect(marker('Everywhere')).toBeHidden();

    // The marker keeps the contrast requirements
    for (const colorScheme of ['light', 'dark'] as const) {
      await popup.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page: popup })
        .include('#profiles-radio')
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    }
  });
});

test('the "applies to this tab" marker follows the headers being typed', async ({
  context,
  extensionOrigin,
  testServerUrl,
}) => {
  const popup = await openPopup(context, extensionOrigin);
  await seedState(popup, {
    profiles: [profile('Work', { headers: [header('', '')] })],
    globalEnabled: true,
  });
  const tab = await context.newPage();
  await tab.goto(`${testServerUrl}/page`);
  await tab.bringToFront();

  const marker = profileRow(popup, 'Work').locator('.profile-applies');
  // A header without name is not applied
  await expect(marker).toBeHidden();
  await popup.locator('.header-name').fill('X-Typed');
  await expect(marker).toBeVisible();
  await popup.locator('.header-name').fill('');
  await expect(marker).toBeHidden();
});

test('the marker is refreshed when leaving the field, before the save delay', async ({
  context,
  extensionOrigin,
  testServerUrl,
}) => {
  const popup = await openPopup(context, extensionOrigin);
  await seedState(popup, {
    profiles: [profile('Work', { headers: [header('', '')] })],
    globalEnabled: true,
  });
  const tab = await context.newPage();
  await tab.goto(`${testServerUrl}/page`);
  await tab.bringToFront();

  const marker = profileRow(popup, 'Work').locator('.profile-applies');
  await expect(marker).toBeHidden();
  // Freeze the page timers: the debounced save never fires, only leaving the field saves
  await popup.clock.install();
  await popup.locator('.header-name').fill('X-Typed');
  await popup.locator('.header-name').press('Tab');
  await expect(marker).toBeVisible();
});
