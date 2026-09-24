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

  it('should refresh every profile-dependent view after profile changes', async () => {
    const src = await readPopupSource();
    const refreshMatch = src.match(/function refreshProfileViews\(\): void \{[\s\S]+?\n\}/);

    assert.ok(refreshMatch, 'refreshProfileViews helper should exist');
    assert.ok(refreshMatch[0].includes('renderProfiles();'), 'Should refresh profiles');
    assert.ok(refreshMatch[0].includes('renderHeaders();'), 'Should refresh headers');
    assert.ok(refreshMatch[0].includes('renderFilters();'), 'Should refresh filters');
  });

  it('should not select a profile when its toggle is changed', async () => {
    const src = await readPopupSource();
    const helperMatch = src.match(/async function setProfileEnabled\([\s\S]+?\n\}/);

    assert.ok(helperMatch, 'setProfileEnabled helper should exist');
    assert.ok(helperMatch[0].includes('profile.enabled = enabled;'));
    assert.ok(!helperMatch[0].includes('activeProfileId ='), 'Toggling must not change selection');
    assert.ok(helperMatch[0].includes('syncExtension: true'), 'Toggling must sync the rules');
  });

  it('should avoid immediate filter rerender while typing', async () => {
    const src = await readPopupSource();

    assert.ok(
      src.includes('setFilterType(index, detectFilterType(v));'),
      'Typing should update filter type locally'
    );
    assert.ok(!src.includes('updateFilterType('), 'Typing should not rerender the list');
  });
});
