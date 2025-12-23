import assert from 'node:assert';
import { test } from 'node:test';
import { countApplicableHeadersForUrl, headerAppliesToUrl } from '../dist/header-utils.js';

const profiles = [
  {
    id: 'p1',
    name: 'Profile 1',
    enabled: true,
    headers: [
      { enabled: true, type: 'request', name: 'X-A', value: '1' },
      { enabled: true, type: 'response', name: 'X-B', value: '2' },
    ],
    filters: [{ enabled: true, type: 'domain', value: 'example.com' }],
  },
  {
    id: 'p2',
    name: 'Profile 2',
    enabled: true,
    headers: [{ enabled: true, type: 'request', name: 'X-C', value: '3' }],
    filters: [],
  },
];

test('headerAppliesToUrl respects domain filters', () => {
  assert.strictEqual(
    headerAppliesToUrl(profiles[0], profiles[0].headers[0], 'https://example.com/foo'),
    true
  );
  assert.strictEqual(
    headerAppliesToUrl(profiles[0], profiles[0].headers[0], 'https://google.com'),
    false
  );
});

test('countApplicableHeadersForUrl counts across profiles', () => {
  assert.strictEqual(countApplicableHeadersForUrl(profiles, 'https://example.com/home'), 3);
  assert.strictEqual(countApplicableHeadersForUrl(profiles, 'https://google.com'), 1);
});
