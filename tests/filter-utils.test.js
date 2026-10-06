import assert from 'node:assert';
import { test } from 'node:test';
import { detectFilterType } from '../dist/filter-utils.js';

test('detectFilterType heuristics', () => {
  assert.strictEqual(detectFilterType('*://example.com/*'), 'url');
  assert.strictEqual(detectFilterType('https://example.com/path'), 'url');
  assert.strictEqual(detectFilterType('example.com'), 'domain');
  assert.strictEqual(detectFilterType('sub.example.com'), 'domain');
  assert.strictEqual(detectFilterType('*.example.com'), 'domain');
  assert.strictEqual(detectFilterType('example.com/path'), 'url');
});

test('detectFilterType treats host:port as url pattern', () => {
  assert.strictEqual(detectFilterType('localhost:3000'), 'url');
});

test('looksLikeRegex spots regular expressions, not valid wildcard patterns', async () => {
  const { looksLikeRegex } = await import('../dist/filter-utils.js');
  // Regular expressions written for ModHeader
  for (const value of [
    '.*://example\\.com/.*',
    'https://example.com/api/.*',
    '^https://example.com',
    'https://example.com/$',
    'example\\.com',
    'https://example.com/.+',
    '(?i)example.com',
    '://.*example.com',
    'https://example.com/items/sku-.*',
  ]) {
    assert.strictEqual(looksLikeRegex(value), true, value);
  }
  // Valid NoobHeaders filters
  for (const value of [
    '',
    'example.com',
    '*.example.com',
    '*://example.com/*',
    'example.*',
    'my-site.*',
    'https://api.example.com/v1/*',
    'localhost:3000',
    '*://*.example.com/api/*?x=*',
  ]) {
    assert.strictEqual(looksLikeRegex(value), false, value);
  }
});

test('the README ModHeader conversions match the same URLs', async () => {
  const { matchFilter } = await import('../dist/matching.js');
  const { detectFilterType } = await import('../dist/filter-utils.js');
  const filter = (value) => ({ enabled: true, type: detectFilterType(value), value });
  const cases = [
    [
      '*://example.com/*',
      ['https://example.com/', 'http://example.com/a/b'],
      ['https://other.com/'],
    ],
    [
      'https://api.example.com/v1/*',
      ['https://api.example.com/v1/users'],
      ['https://api.example.com/v2/users'],
    ],
    [
      '*.example.com',
      ['https://a.example.com/x', 'https://example.com/'],
      ['https://example.org/'],
    ],
  ];
  for (const [value, matching, notMatching] of cases) {
    for (const url of matching) assert.ok(matchFilter(url, filter(value)), `${value} ~ ${url}`);
    for (const url of notMatching)
      assert.ok(!matchFilter(url, filter(value)), `${value} !~ ${url}`);
  }
  // The regular expression form does not work as a NoobHeaders filter (issue #11)
  assert.ok(!matchFilter('https://example.com/api', filter('https://example.com/.*')));
});
