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
  const urlFilters = rules.map((r) => r.condition.urlFilter);
  assert.ok(urlFilters.includes('*://one.example/*'));
  assert.ok(urlFilters.includes('*://two.example/*'));
  assert.strictEqual(rules[0].action.requestHeaders[0].header, 'X-Test');
});

test('url filters with domain filters include initiatorDomains on each rule', () => {
  const profile = {
    headers: [{ enabled: true, type: 'response', name: 'X-Resp', value: '' }],
    filters: [
      { enabled: true, type: 'url', value: '*://a.example/*' },
      { enabled: true, type: 'domain', value: 'origin.example' },
    ],
  };

  const rules = convertProfileToRules(profile, true, 10);
  assert.strictEqual(rules.length, 1, 'Single URL filter should produce one rule');
  const rule = rules[0];
  assert.deepStrictEqual(rule.condition.requestDomains, ['origin.example']);
  assert.strictEqual(rule.action.responseHeaders[0].header, 'X-Resp');
});

test('no url filters produces wildcard urlFilter', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-Wild', value: '1' }],
    filters: [{ enabled: true, type: 'domain', value: 'domainonly.example' }],
  };

  const rules = convertProfileToRules(profile, true);
  assert.strictEqual(rules.length, 1);
  assert.strictEqual(rules[0].condition.urlFilter, '*://*/*');
  assert.deepStrictEqual(rules[0].condition.requestDomains, ['domainonly.example']);
});

test('when globalEnabled is false no rules are produced', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-None', value: '' }],
    filters: [],
  };

  const rules = convertProfileToRules(profile, false);
  assert.strictEqual(rules.length, 0);
});

test('resolveProfilesToApply keeps selected profile last and deduplicated', () => {
  const profiles = [
    { id: 'first', name: 'First', enabled: true, headers: [], filters: [] },
    { id: 'second', name: 'Second', enabled: false, headers: [], filters: [] },
    { id: 'third', name: 'Third', enabled: true, headers: [], filters: [] },
  ];

  const resolved = resolveProfilesToApply(profiles, 'third');

  assert.deepStrictEqual(
    resolved.map((profile) => profile.id),
    ['first', 'third'],
    'Selected profile should always be applied and should override other enabled profiles'
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

test('built-in demo profile is repaired when stored without usable headers', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const src = await fs.readFile(path.join(process.cwd(), 'src/types/index.ts'), 'utf-8');

  assert.ok(src.includes('repairBuiltInDemoProfile'));
  assert.ok(src.includes('BUILT_IN_DEMO_PROFILE_NAMES'));
  assert.ok(src.includes('createDefaultProfile(profile.id)'));
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
