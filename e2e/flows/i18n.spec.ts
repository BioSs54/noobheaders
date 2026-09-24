import { readdirSync, readFileSync } from 'node:fs';
import { expect, test } from '../fixtures';
import { openOptions, openPopup } from '../helpers';

const locales = readdirSync('_locales');

function messages(locale: string): Record<string, { message: string }> {
  return JSON.parse(readFileSync(`_locales/${locale}/messages.json`, 'utf-8'));
}

test('every locale has the same keys as English and no empty message', () => {
  const english = Object.keys(messages('en')).sort();
  for (const locale of locales) {
    const current = messages(locale);
    expect(Object.keys(current).sort(), locale).toEqual(english);
    for (const [key, value] of Object.entries(current)) {
      expect(value.message.trim(), `${locale}/${key}`).not.toBe('');
    }
  }
});

for (const locale of locales) {
  test.describe(`UI in ${locale}`, () => {
    // Chrome expects BCP 47 tags (pt-BR), the _locales folders use underscores (pt_BR)
    test.use({ uiLocale: locale.replace('_', '-') });

    test('popup, dialogs and options are translated', async ({
      context,
      extensionOrigin,
      browserKind,
    }) => {
      test.skip(
        browserKind === 'firefox' && locale !== 'en',
        'The Playwright Firefox build only ships the en-US language pack'
      );
      const strings = messages(locale);
      const popup = await openPopup(context, extensionOrigin);

      await expect(popup.locator('html')).toHaveAttribute('lang', locale.split('_')[0]);
      await expect(popup.locator('#add-header-btn')).toHaveText(strings.addHeader.message);
      await expect(popup.locator('#add-profile-btn')).toHaveAttribute(
        'aria-label',
        strings.addProfile.message
      );
      await expect(popup.locator('.section-header h2').first()).toHaveText(
        strings.profiles.message
      );

      await popup.click('#add-profile-btn');
      await expect(popup.locator('#prompt-title')).toHaveText(strings.addProfile.message);
      await expect(popup.locator('#prompt-ok')).toHaveText(strings.ok.message);
      await expect(popup.locator('#prompt-cancel')).toHaveText(strings.cancel.message);
      await popup.keyboard.press('Escape');

      const options = await openOptions(context, extensionOrigin);
      await expect(options.locator('[data-i18n="generalSettings"]')).toHaveText(
        strings.generalSettings.message
      );
    });
  });
}
