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
