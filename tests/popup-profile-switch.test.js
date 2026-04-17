import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

describe('Popup Profile Switching', () => {
  async function readPopupSource() {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    return fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');
  }

  it('should centralize profile activation in a helper', async () => {
    const src = await readPopupSource();

    assert.ok(
      src.includes(
        'async function activateProfile(profileId: string, persist = true): Promise<void>'
      ),
      'popup.ts should expose an activateProfile helper'
    );
  });

  it('should use profile-scoped filter selection when rendering filters', async () => {
    const src = await readPopupSource();

    assert.ok(
      src.includes('getSelectedFilter(activeProfileId)'),
      'popup.ts should read selected filters with the active profile scope'
    );
    assert.ok(
      src.includes('selectFilterIndex(activeProfileId, index);'),
      'popup.ts should write selected filters with the active profile scope'
    );
  });

  it('should refresh filters and filter editor together after profile changes', async () => {
    const src = await readPopupSource();
    const refreshMatch = src.match(/function refreshProfileViews\(\): void \{[\s\S]+?\n\}/);

    assert.ok(refreshMatch, 'refreshProfileViews helper should exist');
    assert.ok(refreshMatch[0].includes('renderFilters();'), 'Should refresh filters');
    assert.ok(refreshMatch[0].includes('renderFilterEditor();'), 'Should refresh filter editor');
  });

  it('should activate a profile when its toggle is changed', async () => {
    const src = await readPopupSource();
    const lines = src.split('\n');
    let foundProfileToggle = false;
    let foundActivateProfile = false;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('profile.enabled =')) {
        foundProfileToggle = true;
        for (let j = i; j < Math.min(i + 6, lines.length); j++) {
          if (lines[j].includes('await activateProfile(profile.id);')) {
            foundActivateProfile = true;
            break;
          }
        }
      }
    }

    assert.ok(foundProfileToggle, 'Should toggle profile.enabled');
    assert.ok(foundActivateProfile, 'Should activate the toggled profile');
  });

  it('should preserve filter selection state per profile instead of clearing on switch', async () => {
    const src = await readPopupSource();
    const helperMatch = src.match(
      /async function activateProfile\(profileId: string, persist = true\): Promise<void> \{[\s\S]+?\n\}/
    );

    assert.ok(helperMatch, 'activateProfile helper should exist');
    assert.ok(
      !helperMatch[0].includes('clearSelection('),
      'activateProfile should no longer clear filter selection globally on profile change'
    );
  });

  it('should avoid immediate filter rerender while typing', async () => {
    const src = await readPopupSource();

    assert.ok(
      src.includes('setFilterType(index, detected);'),
      'Typing should update filter type locally'
    );
    assert.ok(
      !src.includes('updateFilterType(index, detected);'),
      'Typing should not call the rerendering updateFilterType path'
    );
  });
});
