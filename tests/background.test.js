import assert from 'node:assert';
import { test } from 'node:test';
import { convertProfileToRules } from '../dist/rules.js';

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
  assert.deepStrictEqual(rule.condition.initiatorDomains, ['origin.example']);
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
  assert.deepStrictEqual(rules[0].condition.initiatorDomains, ['domainonly.example']);
});

test('when globalEnabled is false no rules are produced', () => {
  const profile = {
    headers: [{ enabled: true, type: 'request', name: 'X-None', value: '' }],
    filters: [],
  };

  const rules = convertProfileToRules(profile, false);
  assert.strictEqual(rules.length, 0);
});
