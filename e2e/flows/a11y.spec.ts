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
      await popup.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
      await seedState(popup, {
        profiles: [
          profile('Work', {
            headers: [
              header('X-Valid', '1'),
              header('Bad Name', 'x', { enabled: false }),
              // Notes shown for an empty value and for a value made of spaces
              header('X-Removed', ''),
              header('X-Blank', '  '),
            ],
            // The last one shows the "regular expression" hint
            filters: [
              filter('example.com'),
              filter('not a domain'),
              filter('https://a.example/.*'),
            ],
          }),
          profile('Staging', { enabled: false }),
        ],
        globalEnabled: false,
      });
      const scan = () =>
        new AxeBuilder({ page: popup })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();

      // Headers tab, then filters tab
      const results = await scan();
      await popup.click('#tab-filters');
      await expect(popup.locator('#panel-filters')).toBeVisible();
      results.violations.push(...(await scan()).violations);

      // Empty states (no header, no filter) of the second profile
      await popup.locator('.profile-row').last().locator('.profile-row-meta').click();
      await expect(popup.locator('#empty-filters')).toBeVisible();
      results.violations.push(...(await scan()).violations);
      await popup.click('#tab-headers');
      await expect(popup.locator('#empty-headers')).toBeVisible();
      results.violations.push(...(await scan()).violations);
      expect(
        results.violations.flatMap((v) =>
          v.nodes.map((n) => `${v.id} ${n.target} ${JSON.stringify(n.any[0]?.data ?? {})}`)
        )
      ).toEqual([]);
    });

    test('welcome page has no WCAG A/AA violation', async ({ context, extensionOrigin }) => {
      const welcome = await context.newPage();
      await welcome.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
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
      await options.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
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
