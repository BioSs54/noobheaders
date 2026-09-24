import { expect, test } from '../fixtures';
import {
  addHeaderViaUi,
  flushEdits,
  header,
  inputValues,
  openPopup,
  profile,
  readProfiles,
  seedState,
  setToggle,
} from '../helpers';

test.describe('Headers editor', () => {
  test('add a header: the name field is focused and edits are saved', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });
    await expect(page.locator('#empty-headers')).toBeVisible();

    const row = await addHeaderViaUi(page, 'X-Api-Key', 'secret', 'response');
    await expect(page.locator('#empty-headers')).toBeHidden();
    await expect(row.locator('.header-type')).toHaveValue('response');

    await expect
      .poll(async () => (await readProfiles(page))[0].headers)
      .toEqual([{ enabled: true, type: 'response', name: 'X-Api-Key', value: 'secret' }]);
  });

  test('typing keeps the focus and caret while the popup saves', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { headers: [header('', '')] })] });

    const nameInput = page.locator('.header-name');
    await nameInput.click();
    await nameInput.pressSequentially('X-Slow-Typing', { delay: 60 });
    // Wait longer than the save debounce, then continue typing
    await page.waitForTimeout(700);
    await expect(nameInput).toBeFocused();
    await nameInput.pressSequentially('-2', { delay: 30 });
    await expect(nameInput).toHaveValue('X-Slow-Typing-2');

    await flushEdits(page);
    await expect
      .poll(async () => (await readProfiles(page))[0].headers[0].name)
      .toBe('X-Slow-Typing-2');
  });

  test('invalid header names and values are reported inline', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { headers: [header('X-Ok', '1')] })] });

    const row = page.locator('.header-item');
    await row.locator('.header-name').fill('X Bad Name');
    await expect(row).toHaveClass(/invalid/);
    await expect(row.locator('.field-error')).toBeVisible();

    await row.locator('.header-name').fill('X-Good-Name');
    await expect(row).not.toHaveClass(/invalid/);
    await expect(row.locator('.field-error')).toBeHidden();
  });

  test('switch a header off and on', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { headers: [header('X-Toggle', '1')] })] });

    const row = page.locator('.header-item');
    await setToggle(row.locator('.toggle-container'), false);
    await expect(row).toHaveClass(/is-off/);
    await expect.poll(async () => (await readProfiles(page))[0].headers[0].enabled).toBe(false);

    await setToggle(page.locator('.header-item .toggle-container'), true);
    await expect.poll(async () => (await readProfiles(page))[0].headers[0].enabled).toBe(true);
  });

  test('duplicate a header right below the original', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [
        profile('Work', {
          headers: [header('X-First', 'a', { type: 'response' }), header('X-Last', 'z')],
        }),
      ],
    });

    await page.locator('.header-item').first().locator('.duplicate-btn').click();
    await expect(page.locator('.header-item')).toHaveCount(3);
    await expect(page.locator('.header-item').nth(1).locator('.header-name')).toBeFocused();
    await expect
      .poll(() => inputValues(page.locator('.header-name')))
      .toEqual(['X-First', 'X-First', 'X-Last']);

    const headers = (await readProfiles(page))[0].headers ?? [];
    expect(headers[1]).toEqual({ enabled: true, type: 'response', name: 'X-First', value: 'a' });

    // The copy is independent from the original
    await page.locator('.header-item').nth(1).locator('.header-value').fill('b');
    await flushEdits(page);
    await expect
      .poll(async () => (await readProfiles(page))[0].headers?.map((h) => h.value))
      .toEqual(['a', 'b', 'z']);
  });

  test('delete a header and undo', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work', { headers: [header('X-A', '1'), header('X-B', '2')] })],
    });

    await page.locator('.header-item').first().locator('.delete-btn').click();
    await expect.poll(() => inputValues(page.locator('.header-name'))).toEqual(['X-B']);
    await expect.poll(async () => (await readProfiles(page))[0].headers?.length).toBe(1);

    await page.locator('.toast .toast-action').click();
    await expect.poll(() => inputValues(page.locator('.header-name'))).toEqual(['X-A', 'X-B']);
    await expect.poll(async () => (await readProfiles(page))[0].headers?.length).toBe(2);
  });

  test('deleting the last header shows the empty state', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { headers: [header('X-A', '1')] })] });

    await page.locator('.header-item .delete-btn').click();
    await expect(page.locator('#empty-headers')).toBeVisible();
    await expect(page.locator('.profile-row-meta')).toContainText('0');
  });
});
