import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '../fixtures';
import { filter, header, openOptions, openPopup, profile, seedState } from '../helpers';

/**
 * Automated accessibility checks (WCAG 2.x A/AA, including color contrast) on the extension
 * pages, in light and dark mode, with every kind of row rendered.
 */
for (const colorScheme of ['light', 'dark'] as const) {
  test.describe(`Accessibility (${colorScheme})`, () => {
    test('popup has no WCAG A/AA violation', async ({ context, extensionOrigin }) => {
      const popup = await openPopup(context, extensionOrigin);
      await popup.emulateMedia({ colorScheme });
      await seedState(popup, {
        profiles: [
          profile('Work', {
            headers: [header('X-Valid', '1'), header('Bad Name', 'x', { enabled: false })],
            filters: [filter('example.com'), filter('not a domain')],
          }),
          profile('Staging', { enabled: false }),
        ],
        globalEnabled: false,
      });
      await popup.click('#toggle-debug-btn');

      const results = await new AxeBuilder({ page: popup })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      // Empty states (no header, no filter) of the second profile
      await popup.locator('.profile-row').last().locator('.profile-row-meta').click();
      await expect(popup.locator('#empty-headers')).toBeVisible();
      const emptyResults = await new AxeBuilder({ page: popup })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      results.violations.push(...emptyResults.violations);
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id} ${n.target} ${JSON.stringify(n.any[0]?.data ?? {})}`)
        )
      ).toEqual([]);
    });

    test('welcome page has no WCAG A/AA violation', async ({ context, extensionOrigin }) => {
      const welcome = await context.newPage();
      await welcome.emulateMedia({ colorScheme });
      await welcome.goto(`${extensionOrigin}/welcome.html`);
      const results = await new AxeBuilder({ page: welcome })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id} ${n.target} ${JSON.stringify(n.any[0]?.data ?? {})}`)
        )
      ).toEqual([]);
    });

    test('options page has no WCAG A/AA violation', async ({ context, extensionOrigin }) => {
      const options = await openOptions(context, extensionOrigin);
      await options.emulateMedia({ colorScheme });
      const results = await new AxeBuilder({ page: options })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id} ${n.target} ${JSON.stringify(n.any[0]?.data ?? {})}`)
        )
      ).toEqual([]);
    });
  });
}
