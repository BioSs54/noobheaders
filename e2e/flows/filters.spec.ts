import { expect, test } from '../fixtures';
import {
  addFilterViaUi,
  filter,
  flushEdits,
  inputValues,
  openPopup,
  profile,
  readProfiles,
  seedState,
  setToggle,
} from '../helpers';

test.describe('Filters editor', () => {
  test('filter type is detected from the value', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work')] });
    await expect(page.locator('#empty-filters')).toBeVisible();
    await expect(page.locator('#filter-help')).toBeHidden();

    const row = await addFilterViaUi(page, 'example.com');
    await expect(page.locator('#filter-help')).toBeVisible();
    await expect(row.locator('.filter-type-badge')).toHaveText(/domain/i);

    const cases: Array<[string, 'url' | 'domain']> = [
      ['*.example.com', 'domain'],
      ['*://*.example.com/api/*', 'url'],
      ['localhost:3000', 'url'],
      ['example.com/path', 'url'],
    ];
    for (const [value, type] of cases) {
      await row.locator('.filter-value').fill(value);
      await flushEdits(page);
      await expect
        .poll(async () => (await readProfiles(page))[0].filters?.[0])
        .toEqual({ enabled: true, type, value });
    }
  });

  test('invalid filters are reported and can still be switched off', async ({
    context,
    extensionOrigin,
  }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, { profiles: [profile('Work', { filters: [filter('example.com')] })] });

    const row = page.locator('.filter-item');
    await row.locator('.filter-value').fill('not a domain');
    await expect(row).toHaveClass(/invalid/);
    await expect(row.locator('.field-error')).toBeVisible();

    const toggle = row.locator('input[type="checkbox"]');
    await expect(toggle).toBeEnabled();
    await setToggle(row.locator('.toggle-container'), false);
    await expect.poll(async () => (await readProfiles(page))[0].filters?.[0].enabled).toBe(false);

    await row.locator('.filter-value').fill('valid.example');
    await expect(row).not.toHaveClass(/invalid/);
  });

  test('duplicate and delete filters with undo', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [profile('Work', { filters: [filter('one.example'), filter('two.example')] })],
    });

    await page.locator('.filter-item').first().locator('.duplicate-btn').click();
    await expect
      .poll(() => inputValues(page.locator('.filter-value')))
      .toEqual(['one.example', 'one.example', 'two.example']);

    await page.locator('.filter-item').last().locator('.delete-btn').click();
    await expect
      .poll(() => inputValues(page.locator('.filter-value')))
      .toEqual(['one.example', 'one.example']);

    await page.locator('.toast .toast-action').click();
    await expect
      .poll(async () => (await readProfiles(page))[0].filters?.map((f) => f.value))
      .toEqual(['one.example', 'one.example', 'two.example']);
  });

  test('filters belong to the selected profile', async ({ context, extensionOrigin }) => {
    const page = await openPopup(context, extensionOrigin);
    await seedState(page, {
      profiles: [
        profile('Work', { filters: [filter('work.example')] }),
        profile('Staging', { filters: [filter('staging.example'), filter('*.staging.example')] }),
      ],
    });

    await expect.poll(() => inputValues(page.locator('.filter-value'))).toEqual(['work.example']);
    await page.getByRole('button', { name: 'Staging', exact: true }).click();
    await expect
      .poll(() => inputValues(page.locator('.filter-value')))
      .toEqual(['staging.example', '*.staging.example']);

    await page.getByRole('button', { name: 'Work', exact: true }).click();
    await expect.poll(() => inputValues(page.locator('.filter-value'))).toEqual(['work.example']);
  });
});
