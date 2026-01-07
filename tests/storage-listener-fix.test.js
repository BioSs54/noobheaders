/**
 * Test for storage change listener fix
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

describe('Storage Change Listener Fix', () => {
  it('should have isUpdatingStorage flag to prevent re-render loops', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Should have the flag declared
    assert.ok(src.includes('let isUpdatingStorage'), 'Should have isUpdatingStorage flag');

    // Should set flag to true before saving
    assert.ok(
      src.includes('isUpdatingStorage = true'),
      'Should set isUpdatingStorage to true before saving'
    );

    // Should reset flag after saving
    assert.ok(src.includes('isUpdatingStorage = false'), 'Should reset isUpdatingStorage to false');
  });

  it('should check isUpdatingStorage in storage change listener', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Find storage.onChanged listener
    const listenerMatch = src.match(
      /chrome\.storage\.onChanged\.addListener\([\s\S]+?\}\);[\s\S]+?\}\);/
    );

    assert.ok(listenerMatch, 'Should have storage.onChanged listener');

    const listenerBody = listenerMatch[0];

    // Should check the flag at the beginning
    assert.ok(
      listenerBody.includes('if (isUpdatingStorage)') ||
        listenerBody.includes('if(isUpdatingStorage)'),
      'Should check isUpdatingStorage flag'
    );

    // Should return early if flag is true
    assert.ok(
      listenerBody.includes('return'),
      'Should return early when isUpdatingStorage is true'
    );
  });

  it('should reset flag with setTimeout in saveState', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Find saveState function
    const saveStateMatch = src.match(/async function saveState\(\)[^}]+\{[\s\S]+?^\}/m);

    assert.ok(saveStateMatch, 'Should have saveState function');

    const functionBody = saveStateMatch[0];

    // Should use setTimeout to reset the flag
    assert.ok(
      functionBody.includes('setTimeout') && functionBody.includes('isUpdatingStorage = false'),
      'Should reset flag with setTimeout'
    );
  });

  it('should handle errors and reset flag in saveState', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Find saveState function
    const saveStateMatch = src.match(/async function saveState\(\)[^}]+\{[\s\S]+?^\}/m);

    assert.ok(saveStateMatch, 'Should have saveState function');

    const functionBody = saveStateMatch[0];

    // Should reset flag in catch block
    assert.ok(
      functionBody.includes('catch') && functionBody.includes('isUpdatingStorage = false'),
      'Should reset flag in error handler'
    );
  });
});
