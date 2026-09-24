import assert from 'node:assert';
import { test } from 'node:test';
import { convertProfileToRules, resolveProfilesToApply } from '../dist/rules.js';

test('multiple url filters produce separate rules (OR semantics)', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-Test', value: 'v' }],
    filters: [
      { enabled: true, type: 'url', value: '*://one.example/*' },
      { enabled: true, type: 'url', value: '*://two.example/*' },
    ],
  };

  const rules = convertProfileToRules(profile, true, 1);
  assert.strictEqual(rules.length, 2, 'Should create two rules for two URL filters');
  const regexes = rules.map((r) => new RegExp(r.condition.regexFilter, 'i'));
  assert.ok(regexes[0].test('https://one.example/page'));
  assert.ok(regexes[1].test('https://two.example/page'));
  assert.strictEqual(rules[0].condition.isUrlFilterCaseSensitive, false);
  assert.strictEqual(rules[0].action.requestHeaders[0].header, 'X-Test');
});

test('url and domain filters are OR-ed into separate rules', () => {
  const profile = {
    headers: [{ enabled: true, type: 'response', name: 'X-Resp', value: '' }],
    filters: [
      { enabled: true, type: 'url', value: '*://a.example/*' },
      { enabled: true, type: 'domain', value: 'Origin.Example' },
    ],
  };

  const rules = convertProfileToRules(profile, true, 10);
  assert.strictEqual(rules.length, 2, 'One rule for the URL pattern, one for the domains');
  assert.ok(rules[0].condition.regexFilter);
  assert.strictEqual(rules[0].condition.requestDomains, undefined);
  assert.deepStrictEqual(rules[1].condition.requestDomains, ['origin.example']);
  assert.deepStrictEqual(
    rules.map((r) => r.id),
    [10, 11]
  );
  assert.strictEqual(rules[0].action.responseHeaders[0].operation, 'remove');
});

test('domain-only filters use requestDomains without url pattern', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-Wild', value: '1' }],
    filters: [
      { enabled: true, type: 'domain', value: 'domainonly.example' },
      { enabled: true, type: 'domain', value: '*.other.example' },
    ],
  };

  const rules = convertProfileToRules(profile, true);
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].condition.urlFilter, undefined);
  assert.deepStrictEqual(rules[0].condition.requestDomains, [
    'domainonly.example',
    'other.example',
  ]);
});

test('no active filter produces the wildcard urlFilter', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-All', value: '1' }],
    filters: [
      { enabled: false, type: 'domain', value: 'disabled.example' },
      { enabled: true, type: 'url', value: '   ' },
    ],
  };

  const rules = convertProfileToRules(profile, true);
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].condition.urlFilter, '*://*/*');
});

test('invalid filters never widen the scope to every URL', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-Scoped', value: '1' }],
    filters: [{ enabled: true, type: 'domain', value: 'not a domain' }],
  };

  assert.strictEqual(convertProfileToRules(profile, true).length, 0);
});

test('invalid header names or values are skipped instead of breaking every rule', () => {
  const profile = {
    headers: [
      { enabled: true, type: 'request', name: 'Bad Name', value: '1' },
      { enabled: true, type: 'request', name: 'X-Colon:', value: '1' },
      { enabled: true, type: 'request', name: 'X-Newline', value: 'a\nb' },
      { enabled: true, type: 'request', name: '', value: 'empty' },
      { enabled: true, type: 'request', name: '  X-Good  ', value: 'ok' },
    ],
    filters: [],
  };

  const rules = convertProfileToRules(profile, true);
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].action.requestHeaders[0].header, 'X-Good');
});

test('when globalEnabled is false no rules are produced', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-None', value: '' }],
    filters: [],
  };

  const rules = convertProfileToRules(profile, false);
  assert.strictEqual(rules.length, 0);
});

test('resolveProfilesToApply keeps enabled profiles only, selected one last', () => {
  const profiles = [
    { id: 'first', name: 'First', enabled: true, headers: [], filters: [] },
    { id: 'second', name: 'Second', enabled: false, headers: [], filters: [] },
    { id: 'third', name: 'Third', enabled: true, headers: [], filters: [] },
  ];

  assert.deepStrictEqual(
    resolveProfilesToApply(profiles, 'first').map((profile) => profile.id),
    ['third', 'first'],
    'Selected enabled profile should override other enabled profiles'
  );
  assert.deepStrictEqual(
    resolveProfilesToApply(profiles, 'second').map((profile) => profile.id),
    ['first', 'third'],
    'A disabled profile is never applied, even when selected'
  );
});

test('convertProfileToRules honors the provided rule priority', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-Priority', value: 'top' }],
    filters: [],
  };

  const rules = convertProfileToRules(profile, true, 1, 7);

  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].priority, 7);
});

test('legacy normalization enables headers and filters by default in source', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const src = await fs.readFile(path.join(process.cwd(), 'src/types/index.ts'), 'utf-8');

  assert.ok(src.includes('enabled: header.enabled !== false'));
  assert.ok(src.includes('enabled: filter.enabled !== false'));
});

test('normalizeProfiles keeps user edits of the demo profile and deduplicates ids', async () => {
  const { normalizeProfiles } = await import('../dist/types.js');
  const profiles = normalizeProfiles([
    { id: 'a', name: 'httpbin.org Demo', enabled: true, headers: [], filters: [] },
    { id: 'a', name: 'Copy', headers: [], filters: [] },
  ]);

  assert.strictEqual(profiles[0].headers.length, 0, 'Demo profile must not be reset');
  assert.strictEqual(profiles[0].id, 'a');
  assert.notStrictEqual(profiles[1].id, 'a', 'Duplicate ids must be regenerated');
});

test('browser detection prefers declarativeNetRequest over browser namespace', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const src = await fs.readFile(path.join(process.cwd(), 'src/browser-compat.ts'), 'utf-8');

  assert.ok(
    src.includes(
      "typeof chrome !== 'undefined' && typeof chrome.declarativeNetRequest !== 'undefined'"
    )
  );
  assert.ok(src.includes('/firefox/i.test(navigator.userAgent)'));
});
