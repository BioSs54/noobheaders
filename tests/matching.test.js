import assert from 'node:assert';
import { test } from 'node:test';
import {
  filtersMatchUrl,
  isValidDomain,
  isValidHeaderName,
  isValidHeaderValue,
  matchFilter,
  normalizeDomainValue,
  urlPatternToRegexSource,
} from '../dist/matching.js';

const url = (value) => ({ enabled: true, type: 'url', value });
const domain = (value) => ({ enabled: true, type: 'domain', value });

test('url patterns without scheme match any scheme', () => {
  assert.ok(matchFilter('https://github.com/foo/bar', url('github.com/foo/*')));
  assert.ok(matchFilter('http://github.com/foo/bar', url('github.com/foo/*')));
  assert.ok(!matchFilter('https://github.com/other', url('github.com/foo/*')));
});

test('url patterns escape regex characters such as ?', () => {
  assert.ok(matchFilter('https://x.com/?a=1', url('*://x.com/?a=1')));
  assert.ok(!matchFilter('https://x.com/a=1', url('*://x.com/?a=1')));
  assert.ok(!matchFilter('https://xxcom/', url('*://x.com/*')));
});

test('*.domain host wildcard also matches the bare domain', () => {
  const f = url('*://*.example.com/*');
  assert.ok(matchFilter('https://example.com/', f));
  assert.ok(matchFilter('https://a.b.example.com/path', f));
  assert.ok(!matchFilter('https://notexample.com/', f));
});

test('patterns without a path match every path, including ports', () => {
  assert.ok(matchFilter('http://localhost:3000/api', url('localhost:3000')));
  assert.ok(!matchFilter('http://localhost:4000/api', url('localhost:3000')));
  assert.ok(matchFilter('https://example.com/?q=1', url('*://example.com')));
});

test('url patterns are case-insensitive', () => {
  assert.ok(matchFilter('https://example.com/API', url('*://EXAMPLE.com/api')));
});

test('regex sources are RE2 friendly (no lookarounds or backreferences)', () => {
  const source = urlPatternToRegexSource('*://*.example.com/path?x=*');
  assert.ok(!/\(\?[=!<]/.test(source));
  assert.ok(!/\\[1-9]/.test(source));
});

test('domain normalisation', () => {
  assert.strictEqual(normalizeDomainValue(' *.Example.COM. '), 'example.com');
  assert.strictEqual(normalizeDomainValue('https://Example.com/path'), 'example.com');
  assert.strictEqual(normalizeDomainValue('example.com/path'), 'example.com');
  assert.strictEqual(normalizeDomainValue('bücher.de'), 'xn--bcher-kva.de');
  assert.strictEqual(normalizeDomainValue('localhost:3000'), null);
  assert.strictEqual(normalizeDomainValue('not a domain'), null);
  assert.ok(isValidDomain('127.0.0.1'));
  assert.ok(!isValidDomain(''));
});

test('filtersMatchUrl treats invalid active filters as matching nothing', () => {
  assert.ok(filtersMatchUrl([], 'https://a.com/'));
  assert.ok(filtersMatchUrl([{ ...domain('x.com'), enabled: false }], 'https://a.com/'));
  assert.ok(!filtersMatchUrl([domain('not a domain')], 'https://a.com/'));
  assert.ok(filtersMatchUrl([domain('bad domain'), domain('a.com')], 'https://a.com/'));
});

test('header validation', () => {
  assert.ok(isValidHeaderName('X-Custom_Header.1'));
  assert.ok(!isValidHeaderName('X Custom'));
  assert.ok(!isValidHeaderName('X:Custom'));
  assert.ok(!isValidHeaderName(''));
  assert.ok(isValidHeaderValue('any value; with=chars'));
  assert.ok(isValidHeaderValue(''));
  assert.ok(!isValidHeaderValue('a\r\nInjected: 1'));
});
