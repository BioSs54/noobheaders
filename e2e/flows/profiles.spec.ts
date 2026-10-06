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
    // The row is re-rendered: the focus comes back to its rename button
    await expect(page.locator('#rename-profile-btn')).toBeFocused();
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
    // Duplicating a copy does not stack suffixes
    await page.click('#duplicate-profile-btn');
    await expect(page.locator('#active-profile-name')).toHaveText('Work (copy 2)');

    await profileRow(page, 'Work').getByRole('button', { name: 'Work', exact: true }).click();
    await page.click('#duplicate-profile-btn');
    await expect(page.locator('#active-profile-name')).toHaveText('Work (copy 3)');

    const profiles = await readProfiles(page);
    expect(profiles.map((p) => p.name)).toEqual([
      'Work',
      'Work (copy 3)',
      'Work (copy)',
      'Work (copy 2)',
      'Other',
    ]);
    expect(new Set(profiles.map((p) => p.id)).size).toBe(5);
    expect(profiles[1].headers).toEqual([
      { enabled: true, type: 'request', name: 'X-Team', value: 'core' },
    ]);
  });

  test('duplicating recognizes copy suffixes of other languages', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work'), profile('Work (copie 2)')],
      activeProfileId: 'Work (copie 2)',
    });

    await page.click('#duplicate-profile-btn');
    await expect(page.locator('#active-profile-name')).toHaveText('Work (copy)');
  });

  test('rename, duplicate and delete are shown on the selected profile only', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work'), profile('Staging', { enabled: false })],
    });

    const actions = page.locator('.profile-row-actions');
    await expect(actions).toHaveCount(1);
    await expect(profileRow(page, 'Work').locator('.profile-row-actions')).toBeVisible();
    await expect(page.locator('#profile-disabled-hint')).toBeHidden();

    await profileRow(page, 'Staging').locator('.profile-row-meta').click();
    await expect(actions).toHaveCount(1);
    await expect(profileRow(page, 'Staging').locator('.profile-row-actions')).toBeVisible();
    // The "off" hint is shown in the selected row
    await expect(profileRow(page, 'Staging').locator('#profile-disabled-hint')).toBeVisible();
  });

  test('the profile list scrolls to the selection, and only when it changes', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    const names = Array.from({ length: 12 }, (_, i) => `Profile ${i}`);
    await seedState(page, {
      profiles: names.map((name) => profile(name, { enabled: false })),
      activeProfileId: 'Profile 11',
    });

    const list = page.locator('#profiles-radio');
    const isRowInList = (name: string) =>
      list.evaluate((el, rowName) => {
        const row = [...el.querySelectorAll<HTMLElement>('.profile-row')].find(
          (r) => r.querySelector('.profile-name-btn')?.textContent === rowName
        );
        if (!row) return false;
        const listBox = el.getBoundingClientRect();
        const rowBox = row.getBoundingClientRect();
        return rowBox.top >= listBox.top - 1 && rowBox.bottom <= listBox.bottom + 1;
      }, name);

    // The list overflows and the selected (last) profile is scrolled into view
    await expect.poll(() => list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
    await expect.poll(() => isRowInList('Profile 11')).toBe(true);

    // Switching another profile on re-renders the list without moving it
    await list.evaluate((el) => {
      el.scrollTop = 0;
    });
    await setProfileEnabled(page, 'Profile 0', true);
    await expect.poll(async () => (await readProfiles(page))[0].enabled).toBe(true);
    expect(await list.evaluate((el) => el.scrollTop)).toBe(0);
    expect(await isRowInList('Profile 11')).toBe(false);
  });

  test('profiles are reordered with Alt + arrow keys', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('A'), profile('B'), profile('C')],
      activeProfileId: 'B',
    });
    const names = async () => (await readProfiles(page)).map((p) => p.name);
    const rowNames = () => page.locator('.profile-row .profile-name-btn').allTextContents();

    await profileRow(page, 'A').getByRole('button', { name: 'A', exact: true }).focus();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(names).toEqual(['B', 'A', 'C']);
    await expect.poll(rowNames).toEqual(['B', 'A', 'C']);
    // The focus follows the moved profile, so it can be moved again
    await expect(page.getByRole('button', { name: 'A', exact: true })).toBeFocused();
    await page.keyboard.press('Alt+ArrowDown');
    await expect.poll(names).toEqual(['B', 'C', 'A']);

    // Already last: nothing changes
    await page.keyboard.press('Alt+ArrowDown');
    await page.keyboard.press('Alt+ArrowUp');
    await expect.poll(names).toEqual(['B', 'A', 'C']);

    // Moving does not change the selection or the enabled state
    expect(await readActiveProfileId(page)).toBe('B');
    expect((await readProfiles(page)).every((p) => p.enabled)).toBe(true);
  });

  test('profiles are reordered with drag and drop', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('A'), profile('B'), profile('C')] });
    const names = async () => (await readProfiles(page)).map((p) => p.name);

    // Drop C on the top half of A: before A
    await profileRow(page, 'C').dragTo(profileRow(page, 'A'), {
      targetPosition: { x: 40, y: 4 },
    });
    await expect.poll(names).toEqual(['C', 'A', 'B']);

    // Drop C on the bottom half of B: after B
    const boxB = await profileRow(page, 'B').boundingBox();
    await profileRow(page, 'C').dragTo(profileRow(page, 'B'), {
      targetPosition: { x: 40, y: (boxB?.height ?? 40) - 4 },
    });
    await expect.poll(names).toEqual(['A', 'B', 'C']);
    await expect(page.locator('.drop-before, .drop-after, .is-dragging')).toHaveCount(0);
  });

  test('a search field filters the profiles when there are many', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    const many = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map((name) =>
      profile(name)
    );
    await seedState(page, { profiles: many });
    const search = page.locator('#profile-search');
    // Six profiles or fewer: no search field
    await expect(search).toBeHidden();

    await seedState(page, { profiles: [...many, profile('Staging API')] });
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('placeholder', 'Search profiles');

    await search.fill('ta');
    await expect(page.locator('.profile-row:visible .profile-name-btn')).toHaveText([
      'Beta',
      'Delta',
      'Zeta',
      'Staging API',
    ]);
    // Reordering is off while the list is filtered
    await expect(profileRow(page, 'Beta')).not.toHaveAttribute('draggable', 'true');

    // Case-insensitive
    await search.fill('API');
    await expect(page.locator('.profile-row:visible .profile-name-btn')).toHaveText([
      'Staging API',
    ]);

    // Selecting a filtered profile keeps the search
    await page.getByRole('button', { name: 'Staging API', exact: true }).click();
    await expect(page.locator('#active-profile-name')).toHaveText('Staging API');
    await expect(search).toHaveValue('API');

    await search.fill('nothing');
    await expect(page.locator('.profile-row:visible')).toHaveCount(0);
    await expect(page.locator('#profile-search-empty')).toBeVisible();

    await search.fill('');
    await expect(page.locator('.profile-row:visible')).toHaveCount(7);
    await expect(page.locator('#profile-search-empty')).toBeHidden();
    await expect(profileRow(page, 'Beta')).toHaveAttribute('draggable', 'true');
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

  test('clicking anywhere on a profile card selects it, except its switch', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [
        profile('Work', { headers: [header('X-Work', '1')] }),
        profile('Staging', { enabled: false, headers: [header('X-A', '1'), header('X-B', '2')] }),
      ],
    });

    const staging = profileRow(page, 'Staging');
    await expect(staging.locator('.profile-row-meta')).toHaveText('Headers: 2 · Filters: 0');
    await staging.locator('.profile-row-meta').click();
    await expect(page.locator('#active-profile-name')).toHaveText('Staging');
    await expect.poll(() => readActiveProfileId(page)).toBe('Staging');

    // The switch turns the profile on without selecting it
    await profileRow(page, 'Work').locator('.toggle-slider').click();
    await expect(page.locator('#active-profile-name')).toHaveText('Staging');
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
