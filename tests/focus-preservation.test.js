/**
 * Tests for focus preservation in popup inputs
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

describe('Focus Preservation', () => {
  it('should have data-index and data-field attributes on inputs', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Should set data attributes on header name input
    assert.ok(
      src.includes("nameInput.setAttribute('data-index'") ||
        src.includes('nameInput.setAttribute("data-index"'),
      'Should set data-index on name input'
    );

    assert.ok(
      src.includes("nameInput.setAttribute('data-field', 'name')") ||
        src.includes('nameInput.setAttribute("data-field", "name")'),
      'Should set data-field on name input'
    );

    // Should set data attributes on header value input
    assert.ok(
      src.includes("valueInput.setAttribute('data-index'") ||
        src.includes('valueInput.setAttribute("data-index"'),
      'Should set data-index on value input'
    );

    assert.ok(
      src.includes("valueInput.setAttribute('data-field', 'value')") ||
        src.includes('valueInput.setAttribute("data-field", "value")'),
      'Should set data-field on value input'
    );
  });

  it('should preserve focus and selection in renderHeaders', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Find renderHeaders function
    const renderHeadersMatch = src.match(
      /function renderHeaders\(\)[^}]+\{[\s\S]+?(?=\nfunction |\n\/\*\*|\n\/\/|$)/
    );

    assert.ok(renderHeadersMatch, 'Should have renderHeaders function');

    const functionBody = renderHeadersMatch[0];

    // Should capture active element
    assert.ok(functionBody.includes('document.activeElement'), 'Should get active element');

    // Should capture focus data
    assert.ok(
      functionBody.includes('focusedIndex') && functionBody.includes('focusedField'),
      'Should capture focused index and field'
    );

    // Should capture selection
    assert.ok(
      functionBody.includes('selectionStart') || functionBody.includes('selStart'),
      'Should capture selection start'
    );

    // Should restore focus
    assert.ok(functionBody.includes('.focus()'), 'Should restore focus');

    // Should restore selection
    assert.ok(functionBody.includes('setSelectionRange'), 'Should restore selection range');
  });

  it('should use scheduleSave for debounced updates', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Should have scheduleSave function with debounce
    assert.ok(src.includes('function scheduleSave'), 'Should have scheduleSave function');

    assert.ok(
      src.includes('setTimeout') || src.includes('window.setTimeout'),
      'Should use setTimeout for debouncing'
    );

    // updateHeaderName and updateHeaderValue should use scheduleSave
    const updateHeaderNameMatch = src.match(/function updateHeaderName[^}]+\{[\s\S]+?\n\}/);

    assert.ok(updateHeaderNameMatch, 'Should have updateHeaderName');
    assert.ok(
      updateHeaderNameMatch[0].includes('scheduleSave'),
      'updateHeaderName should use scheduleSave'
    );

    const updateHeaderValueMatch = src.match(/function updateHeaderValue[^}]+\{[\s\S]+?\n\}/);

    assert.ok(updateHeaderValueMatch, 'Should have updateHeaderValue');
    assert.ok(
      updateHeaderValueMatch[0].includes('scheduleSave'),
      'updateHeaderValue should use scheduleSave'
    );
  });

  it('should have saveTimer variable for debouncing', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Should declare saveTimer
    assert.ok(
      src.includes('let saveTimer') || src.includes('var saveTimer'),
      'Should have saveTimer variable'
    );

    // Should clear previous timer
    assert.ok(src.includes('clearTimeout'), 'Should clear previous timeout');
  });
});
