/**
 * Tests for profile enable/disable functionality
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

describe('Profile Enable/Disable Logic', () => {
  it('should filter enabled profiles correctly in background.ts', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/background.ts'), 'utf-8');

    // Should use strict equality to check enabled status
    assert.ok(src.includes('p.enabled === true'), 'Should use strict equality for enabled check');

    // Should handle updateRules message
    assert.ok(
      src.includes("message.action === 'updateRules'"),
      'Should handle updateRules message'
    );

    // Should handle updateBadge message
    assert.ok(
      src.includes("message.action === 'updateBadge'"),
      'Should handle updateBadge message'
    );
  });

  it('should send updateRules message when toggling profile', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // Should send updateRules after changing profile.enabled
    const lines = src.split('\n');
    let foundToggle = false;
    let foundUpdate = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('profile.enabled =')) {
        foundToggle = true;
        // Check next few lines for updateRules
        for (let j = i; j < Math.min(i + 10, lines.length); j++) {
          if (lines[j].includes('updateRules')) {
            foundUpdate = true;
            break;
          }
        }
      }
    }

    assert.ok(foundToggle, 'Should set profile.enabled');
    assert.ok(foundUpdate, 'Should call updateRules after toggling');
  });

  it('should have Profile type with optional enabled property', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/types/index.ts'), 'utf-8');

    // Should have enabled as optional boolean
    assert.ok(
      src.includes('enabled?: boolean') || src.includes('enabled?:boolean'),
      'Profile should have optional enabled property'
    );
  });

  it('should clear rules when global is disabled', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/background.ts'), 'utf-8');

    // Find handleUpdateRules function
    const handleUpdateRulesMatch = src.match(
      /async function handleUpdateRules\(\)[^}]+\{[\s\S]+?\n\}/
    );

    assert.ok(handleUpdateRulesMatch, 'Should have handleUpdateRules function');

    const functionBody = handleUpdateRulesMatch[0];

    // Should check if global is disabled and clear rules
    assert.ok(
      functionBody.includes('!globalEnabled') && functionBody.includes('applyRules([])'),
      'Should clear rules when global is disabled'
    );
  });
});
