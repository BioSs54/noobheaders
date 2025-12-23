import assert from 'node:assert';
import { test } from 'node:test';
import { convertProfileToRules } from '../dist/rules.js';

test('convertProfileToRules returns rules only when globalEnabled true', () => {
  const p = { headers: [{ enabled: true, type: 'request', name: 'X', value: '1' }], filters: [] };
  const rulesFalse = convertProfileToRules(p, false);
  assert.strictEqual(rulesFalse.length, 0);
  const rulesTrue = convertProfileToRules(p, true);
  assert.strictEqual(rulesTrue.length > 0, true);
});

test('merging rules from multiple profiles yields combined rules', () => {
  const p1 = {
    headers: [{ enabled: true, type: 'request', name: 'X-1', value: '1' }],
    filters: [],
  };
  const p2 = {
    headers: [{ enabled: true, type: 'request', name: 'X-2', value: '2' }],
    filters: [],
  };
  const r1 = convertProfileToRules(p1, true, 1);
  const r2 = convertProfileToRules(p2, true, r1.length + 1);
  const combined = r1.concat(r2);
  assert.strictEqual(combined.length, r1.length + r2.length);
  // Ensure ids don't collide
  const ids = combined.map((r) => r.id);
  const set = new Set(ids);
  assert.strictEqual(set.size, ids.length);
});
