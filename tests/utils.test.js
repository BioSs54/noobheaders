import assert from 'node:assert';
import { test } from 'node:test';

// Utility function to generate IDs (copied from popup.js for testing)
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

test('generateId creates unique IDs', () => {
  const id1 = generateId();
  const id2 = generateId();

  assert.notStrictEqual(id1, id2, 'Generated IDs should be unique');
});

test('generateId format is correct', () => {
  const id = generateId();

  assert.ok(id.includes('-'), 'ID should contain a dash');

  const parts = id.split('-');
  assert.strictEqual(parts.length, 2, 'ID should have two parts');

  const timestamp = Number.parseInt(parts[0]);
  assert.ok(!Number.isNaN(timestamp), 'First part should be a valid timestamp');
  assert.ok(timestamp > 0, 'Timestamp should be positive');
});

test('profile object structure', () => {
  const profile = {
    id: generateId(),
    name: 'Test Profile',
    enabled: false,
    headers: [],
    filters: [],
  };

  assert.ok(profile.id, 'Profile should have an id');
  assert.ok(profile.name, 'Profile should have a name');
  assert.strictEqual(typeof profile.enabled, 'boolean', 'enabled should be boolean');
  assert.ok(Array.isArray(profile.headers), 'headers should be an array');
  assert.ok(Array.isArray(profile.filters), 'filters should be an array');
});

test('header object structure', () => {
  const header = {
    enabled: true,
    type: 'request',
    name: 'User-Agent',
    value: 'CustomAgent/1.0',
  };

  assert.strictEqual(typeof header.enabled, 'boolean', 'enabled should be boolean');
  assert.ok(['request', 'response'].includes(header.type), 'type should be request or response');
  assert.ok(header.name, 'header should have a name');
  assert.strictEqual(typeof header.value, 'string', 'value should be a string');
});

test('filter object structure', () => {
  const filter = {
    enabled: true,
    type: 'url',
    value: '*://example.com/*',
  };

  assert.strictEqual(typeof filter.enabled, 'boolean', 'enabled should be boolean');
  assert.ok(['url', 'domain'].includes(filter.type), 'type should be url or domain');
  assert.ok(filter.value, 'filter should have a value');
});

console.log('✅ All utility tests passed');
