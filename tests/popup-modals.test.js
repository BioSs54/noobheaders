/**
 * Tests for popup modal and toast functionality
 */

import { strict as assert } from 'node:assert';
import { before, describe, it } from 'node:test';

describe('Popup Modal System', () => {
  it('should have modal HTML structure in popup.html', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const html = await fs.readFile(path.join(process.cwd(), 'popup.html'), 'utf-8');

    // Check for toast container
    assert.ok(html.includes('id="toast-container"'), 'Toast container should exist');
    assert.ok(
      html.includes('class="toast-container"'),
      'Toast container should have correct class'
    );

    // Check for confirm modal
    assert.ok(html.includes('id="confirm-modal"'), 'Confirm modal should exist');
    assert.ok(html.includes('id="confirm-title"'), 'Confirm modal should have title element');
    assert.ok(html.includes('id="confirm-message"'), 'Confirm modal should have message element');
    assert.ok(html.includes('id="confirm-ok"'), 'Confirm modal should have OK button');
    assert.ok(html.includes('id="confirm-cancel"'), 'Confirm modal should have Cancel button');

    // Check for prompt modal
    assert.ok(html.includes('id="prompt-modal"'), 'Prompt modal should exist');
    assert.ok(html.includes('id="prompt-title"'), 'Prompt modal should have title element');
    assert.ok(html.includes('id="prompt-input"'), 'Prompt modal should have input element');
    assert.ok(html.includes('id="prompt-ok"'), 'Prompt modal should have OK button');
    assert.ok(html.includes('id="prompt-cancel"'), 'Prompt modal should have Cancel button');
  });

  it('should have CSS styles for modals and toasts', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const css = await fs.readFile(path.join(process.cwd(), 'styles.css'), 'utf-8');

    // Check for toast styles
    assert.ok(css.includes('.toast-container'), 'Should have toast-container styles');
    assert.ok(css.includes('.toast'), 'Should have toast styles');
    assert.ok(css.includes('.toast.error'), 'Should have error toast styles');
    assert.ok(css.includes('.toast.success'), 'Should have success toast styles');
    assert.ok(css.includes('.toast.warning'), 'Should have warning toast styles');

    // Check for modal styles
    assert.ok(css.includes('.modal-overlay'), 'Should have modal-overlay styles');
    assert.ok(css.includes('.modal-content'), 'Should have modal-content styles');
    assert.ok(css.includes('.modal-title'), 'Should have modal-title styles');
    assert.ok(css.includes('.modal-message'), 'Should have modal-message styles');
    assert.ok(css.includes('.modal-input'), 'Should have modal-input styles');
    assert.ok(css.includes('.modal-actions'), 'Should have modal-actions styles');
  });

  it('should not use alert() or confirm() in popup.ts', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    // These should not exist (except in comments)
    const lines = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'));
    const code = lines.join('\n');

    assert.ok(!code.includes('alert('), 'Should not use alert() in code');
    assert.ok(!code.includes('confirm('), 'Should not use confirm() in code');
    assert.ok(!code.includes('prompt('), 'Should not use prompt() in code (except showPrompt)');
  });

  it('should have showToast, showConfirm, and showPrompt functions', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const src = await fs.readFile(path.join(process.cwd(), 'src/popup.ts'), 'utf-8');

    assert.ok(src.includes('function showToast('), 'Should have showToast function');
    assert.ok(src.includes('function showConfirm('), 'Should have showConfirm function');
    assert.ok(src.includes('function showPrompt('), 'Should have showPrompt function');
  });

  it('should have i18n keys for modals', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const messages = JSON.parse(
      await fs.readFile(path.join(process.cwd(), '_locales/en/messages.json'), 'utf-8')
    );

    assert.ok(messages.cancel, 'Should have cancel key');
    assert.ok(messages.confirm, 'Should have confirm key');
    assert.ok(messages.ok, 'Should have ok key');
    assert.ok(messages.profileAdded, 'Should have profileAdded key');
    assert.ok(messages.profileDeleted, 'Should have profileDeleted key');
    assert.ok(messages.profileRenamed, 'Should have profileRenamed key');
    assert.ok(messages.profilesImported, 'Should have profilesImported key');
    assert.ok(messages.dataCleared, 'Should have dataCleared key');
  });
});
