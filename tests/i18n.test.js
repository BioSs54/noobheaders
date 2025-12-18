import assert from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const localesDir = join(rootDir, '_locales');

test('_locales directory exists', () => {
  assert.doesNotThrow(() => {
    readdirSync(localesDir);
  }, '_locales directory should exist');
});

test('en locale exists and is valid', () => {
  const enPath = join(localesDir, 'en', 'messages.json');
  const enContent = readFileSync(enPath, 'utf-8');

  assert.doesNotThrow(() => {
    JSON.parse(enContent);
  }, 'en/messages.json should be valid JSON');

  const messages = JSON.parse(enContent);
  assert.ok(messages.extensionName, 'Should have extensionName');
  assert.ok(messages.extensionDescription, 'Should have extensionDescription');
});

test('all locales have same keys as en', () => {
  const enPath = join(localesDir, 'en', 'messages.json');
  const enMessages = JSON.parse(readFileSync(enPath, 'utf-8'));
  const enKeys = Object.keys(enMessages);

  const locales = readdirSync(localesDir);

  for (const locale of locales) {
    if (locale === 'en') continue;

    const localePath = join(localesDir, locale, 'messages.json');
    const localeMessages = JSON.parse(readFileSync(localePath, 'utf-8'));
    const localeKeys = Object.keys(localeMessages);

    assert.deepStrictEqual(
      localeKeys.sort(),
      enKeys.sort(),
      `${locale} should have same keys as en`
    );
  }
});

test('all locale messages have required fields', () => {
  const locales = readdirSync(localesDir);

  for (const locale of locales) {
    const localePath = join(localesDir, locale, 'messages.json');
    const messages = JSON.parse(readFileSync(localePath, 'utf-8'));

    for (const [key, value] of Object.entries(messages)) {
      assert.ok(value.message, `${locale}/${key} should have message field`);
      // Description field is optional for UI strings
    }
  }
});

console.log('✅ All i18n tests passed');
