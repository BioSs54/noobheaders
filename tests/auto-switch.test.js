import assert from 'node:assert';
import { test } from 'node:test';
import { isValidDomain, matchFilter, selectProfileForUrl } from '../dist/auto-switch.js';

const profiles = [
  {
    id: 'p1',
    name: 'Profile 1',
    enabled: true,
    headers: [],
    filters: [{ enabled: true, type: 'domain', value: 'example.com' }],
  },
  {
    id: 'p2',
    name: 'Profile 2',
    enabled: true,
    headers: [],
    filters: [{ enabled: true, type: 'url', value: '*://github.com/*' }],
  },
];

test('matchFilter matches domain filters', () => {
  assert.strictEqual(matchFilter('https://example.com/foo', profiles[0].filters[0]), true);
  assert.strictEqual(matchFilter('https://sub.example.com', profiles[0].filters[0]), true);
  assert.strictEqual(matchFilter('https://example.org', profiles[0].filters[0]), false);

  // case-insensitive
  assert.strictEqual(matchFilter('https://EXAMPLE.com', profiles[0].filters[0]), true);

  // leading wildcard in filter
  const wildcardFilter = { enabled: true, type: 'domain', value: '*.example.com' };
  assert.strictEqual(matchFilter('https://sub.example.com', wildcardFilter), true);

  // filter value provided as full URL
  const urlValueFilter = { enabled: true, type: 'domain', value: 'https://example.com/path' };
  assert.strictEqual(matchFilter('https://example.com/another', urlValueFilter), true);

  // filter value with spaces
  const spacedFilter = { enabled: true, type: 'domain', value: '  example.com  ' };
  assert.strictEqual(matchFilter('https://example.com', spacedFilter), true);

  // isValidDomain helper
  assert.strictEqual(isValidDomain('example.com'), true);
  assert.strictEqual(isValidDomain('*.example.com'), true);
  assert.strictEqual(isValidDomain('https://example.com/path'), true);
  assert.strictEqual(isValidDomain('not a domain'), false);
});

test('matchFilter matches url patterns', () => {
  assert.strictEqual(
    matchFilter('https://github.com/BioSs54/noobheaders', profiles[1].filters[0]),
    true
  );
  assert.strictEqual(matchFilter('https://gist.github.com', profiles[1].filters[0]), false);
});

test('selectProfileForUrl picks the first matching profile', () => {
  const p = selectProfileForUrl(profiles, 'https://github.com/BioSs54/noobheaders');
  assert.strictEqual(p?.id, 'p2');
});
