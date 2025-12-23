import assert from 'node:assert';
import { test } from 'node:test';
import { clearSelection, getSelectedFilter, selectFilter } from '../dist/filter-selection.js';

test('filter selection API works', () => {
  clearSelection();
  assert.strictEqual(getSelectedFilter(), null);
  selectFilter(2);
  assert.strictEqual(getSelectedFilter(), 2);
  clearSelection();
  assert.strictEqual(getSelectedFilter(), null);
});
