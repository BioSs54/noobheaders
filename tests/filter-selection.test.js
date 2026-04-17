import assert from 'node:assert';
import { test } from 'node:test';
import { clearSelection, getSelectedFilter, selectFilter } from '../dist/filter-selection.js';

test('filter selection API scopes selection by profile', () => {
  clearSelection();
  assert.strictEqual(getSelectedFilter('profile-a'), null);

  selectFilter('profile-a', 2);
  selectFilter('profile-b', 1);

  assert.strictEqual(getSelectedFilter('profile-a'), 2);
  assert.strictEqual(getSelectedFilter('profile-b'), 1);

  clearSelection('profile-a');
  assert.strictEqual(getSelectedFilter('profile-a'), null);
  assert.strictEqual(getSelectedFilter('profile-b'), 1);

  clearSelection();
  assert.strictEqual(getSelectedFilter('profile-b'), null);
});
