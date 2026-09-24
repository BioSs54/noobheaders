import { expect, test } from '../fixtures';
import {
  answerPrompt,
  header,
  inputValues,
  openPopup,
  profile,
  profileRow,
  readActiveProfileId,
  readProfiles,
  seedState,
  setProfileEnabled,
} from '../helpers';

test.describe('Profiles', () => {
  test('add a profile: it becomes selected, empty and switched off', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });

    await page.click('#add-profile-btn');
    await expect(page.locator('#prompt-input')).toBeFocused();
    await answerPrompt(page, '  Staging  ');

    await expect(page.locator('#prompt-modal')).toBeHidden();
    await expect(page.locator('.toast.success')).toBeVisible();
    await expect(page.locator('.profile-row')).toHaveCount(2);
    await expect(page.locator('#active-profile-name')).toHaveText('Staging');
    await expect(profileRow(page, 'Staging')).toHaveClass(/active/);
    await expect(page.locator('#empty-headers')).toBeVisible();

    const profiles = await readProfiles(page);
    expect(profiles.map((p) => p.name)).toEqual(['Work', 'Staging']);
    expect(profiles[1].enabled).toBe(false);
    expect(await readActiveProfileId(page)).toBe(profiles[1].id);
  });

  test('profile names are validated in the prompt', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });

    await page.click('#add-profile-btn');
    await page.click('#prompt-ok');
    await expect(page.locator('#prompt-error')).toBeVisible();
    await expect(page.locator('#prompt-input')).toHaveAttribute('aria-invalid', 'true');

    await answerPrompt(page, 'work');
    await expect(page.locator('#prompt-modal')).toBeVisible();
    await expect(page.locator('#prompt-error')).toBeVisible();

    // Typing clears the error
    await page.locator('#prompt-input').fill('Work 2');
    await expect(page.locator('#prompt-error')).toBeHidden();

    // Escape cancels and restores the focus on the trigger
    await page.keyboard.press('Escape');
    await expect(page.locator('#prompt-modal')).toBeHidden();
    await expect(page.locator('#add-profile-btn')).toBeFocused();
    expect(await readProfiles(page)).toHaveLength(1);
  });

  test('clicking the overlay cancels the prompt', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });

    await page.click('#add-profile-btn');
    await page.locator('#prompt-modal').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#prompt-modal')).toBeHidden();
    expect(await readProfiles(page)).toHaveLength(1);

    // Re-opening works and still resolves only once
    await page.click('#add-profile-btn');
    await answerPrompt(page, 'Staging');
    await expect(page.locator('.profile-row')).toHaveCount(2);
  });

  test('rename the selected profile', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work'), profile('Staging')] });

    await page.click('#rename-profile-btn');
    await expect(page.locator('#prompt-input')).toHaveValue('Work');
    await answerPrompt(page, 'Staging');
    await expect(page.locator('#prompt-error')).toBeVisible();

    await answerPrompt(page, 'Production');
    await expect(page.locator('#active-profile-name')).toHaveText('Production');
    await expect(profileRow(page, 'Production')).toBeVisible();
    expect((await readProfiles(page)).map((p) => p.name)).toEqual(['Production', 'Staging']);
  });

  test('duplicate a profile with a unique name, right after the original', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work', { headers: [header('X-Team', 'core')] }), profile('Other')],
    });

    await page.click('#duplicate-profile-btn');
    await expect(page.locator('#active-profile-name')).toHaveText('Work (copy)');
    await page.click('#duplicate-profile-btn');
    await expect(page.locator('#active-profile-name')).toHaveText('Work (copy) (copy)');

    await profileRow(page, 'Work').getByRole('button', { name: 'Work', exact: true }).click();
    await page.click('#duplicate-profile-btn');
    await expect(page.locator('#active-profile-name')).toHaveText('Work (copy 2)');

    const profiles = await readProfiles(page);
    expect(profiles.map((p) => p.name)).toEqual([
      'Work',
      'Work (copy 2)',
      'Work (copy)',
      'Work (copy) (copy)',
      'Other',
    ]);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(5);
    expect(profiles[1].headers).toEqual([
      { enabled: true, type: 'request', name: 'X-Team', value: 'core' },
    ]);
  });

  test('delete a profile after confirmation', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work'), profile('Staging')],
      activeProfileId: 'Staging',
    });

    await page.click('#delete-profile-btn');
    await expect(page.locator('#confirm-message')).toContainText('Staging');
    // The safe choice is focused by default
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator('#confirm-modal')).toBeHidden();
    expect(await readProfiles(page)).toHaveLength(2);

    await page.click('#delete-profile-btn');
    await page.click('#confirm-ok');
    await expect(page.locator('.profile-row')).toHaveCount(1);
    await expect(page.locator('#active-profile-name')).toHaveText('Work');
    await expect(page.locator('#delete-profile-btn')).toBeDisabled();
  });

  test('the modal keeps the keyboard focus inside', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work'), profile('Staging')] });

    await page.click('#delete-profile-btn');
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm-ok')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.locator('#confirm-cancel')).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(page.locator('#confirm-ok')).toBeFocused();
    await page.keyboard.press('Escape');
  });

  test('switching a profile on/off does not change the selection', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work', { enabled: false }), profile('Staging', { enabled: false })],
      activeProfileId: 'Work',
    });

    await expect(page.locator('#profile-disabled-hint')).toBeVisible();
    await setProfileEnabled(page, 'Staging', true);
    await expect(page.locator('#active-profile-name')).toHaveText('Work');
    expect(await readActiveProfileId(page)).toBe('Work');
    await expect.poll(async () => (await readProfiles(page))[1].enabled).toBe(true);

    await setProfileEnabled(page, 'Work', true);
    await expect(page.locator('#profile-disabled-hint')).toBeHidden();
    await setProfileEnabled(page, 'Work', false);
    await expect(page.locator('#profile-disabled-hint')).toBeVisible();
    await expect(page.locator('#active-profile-name')).toHaveText('Work');
  });

  test('clicking a profile name selects it and shows its headers', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [
        profile('Work', { headers: [header('X-Work', '1')] }),
        profile('Staging', { headers: [header('X-Staging', '1'), header('X-Other', '2')] }),
      ],
    });

    await expect.poll(() => inputValues(page.locator('.header-name'))).toEqual(['X-Work']);
    await page.getByRole('button', { name: 'Staging', exact: true }).click();
    await expect(page.locator('#active-profile-name')).toHaveText('Staging');
    await expect
      .poll(() => inputValues(page.locator('.header-name')))
      .toEqual(['X-Staging', 'X-Other']);
    await expect(profileRow(page, 'Staging').locator('.profile-row-meta')).toContainText('2');
    await expect.poll(() => readActiveProfileId(page)).toBe('Staging');
  });
});
