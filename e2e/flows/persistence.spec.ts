import { expect, test } from '../fixtures';
import {
  expectRequestHeader,
  header,
  openPopup,
  profile,
  readActiveProfileId,
  readProfiles,
  reloadExtensionPage,
  seedState,
} from '../helpers';

test.describe('Persistence', () => {
  test('edits typed right before the popup closes are kept', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work', { headers: [header('', '')] })],
      globalEnabled: true,
    });

    await popup.locator('.header-name').fill('X-Closed-Fast');
    await popup.locator('.header-value').fill('kept');
    // Close without blurring the field: the debounced save has not run yet
    await popup.close({ runBeforeUnload: true });

    const reopened = await openPopup(context, extensionOrigin);
    await expect(reopened.locator('.header-name')).toHaveValue('X-Closed-Fast');
    await expect(reopened.locator('.header-value')).toHaveValue('kept');
    await expect
      .poll(async () => (await readProfiles(reopened))[0].headers?.[0])
      .toMatchObject({ name: 'X-Closed-Fast', value: 'kept' });

    const probe = await context.newPage();
    await expectRequestHeader(probe, testServerUrl, 'X-Closed-Fast', 'kept');
  });

  test('selection and switches survive a reload', async ({ context, extensionOrigin }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, { profiles: [profile('Work'), profile('Staging', { enabled: false })] });

    await popup.getByRole('button', { name: 'Staging', exact: true }).click();
    await expect.poll(() => readActiveProfileId(popup)).toBe('Staging');

    await reloadExtensionPage(popup);
    await expect(popup.locator('#active-profile-name')).toHaveText('Staging');
    await expect(popup.locator('.profile-row input[type="checkbox"]')).toHaveCount(2);
    await expect(popup.locator('.profile-row input[type="checkbox"]').first()).toBeChecked();
    await expect(popup.locator('.profile-row input[type="checkbox"]').last()).not.toBeChecked();
  });

  test('a stale selected profile id falls back to the first profile', async ({
    context,
    extensionOrigin,
  }) => {
    const popup = await openPopup(context, extensionOrigin);
    await seedState(popup, { profiles: [profile('Work')], activeProfileId: 'deleted-profile' });

    await expect(popup.locator('#active-profile-name')).toHaveText('Work');
    await expect.poll(() => readActiveProfileId(popup)).toBe('Work');
  });
});
