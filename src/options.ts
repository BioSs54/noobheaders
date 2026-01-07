/**
 * NoobHeaders - Options Page
 */

import { getMessage } from './i18n.js';
import type { Profile } from './types/index.js';
import { STORAGE_KEYS } from './types/index.js';

interface OptionsData {
  autoEnable?: boolean;
  showBadge?: boolean;
  pendingAction?: 'import' | 'export';
}

async function loadOptions(): Promise<void> {
  const data = (await chrome.storage.local.get([
    'autoEnable',
    'showBadge',
    'pendingAction',
  ])) as OptionsData;

  const autoEnableEl = document.getElementById('auto-enable') as HTMLInputElement;
  const showBadgeEl = document.getElementById('show-badge') as HTMLInputElement;

  if (autoEnableEl) {
    autoEnableEl.checked = data.autoEnable || false;
  }

  if (showBadgeEl) {
    showBadgeEl.checked = data.showBadge !== false;
  }

  // Handle pending action from popup
  if (data.pendingAction) {
    // Clear the pending action
    await chrome.storage.local.remove('pendingAction');

    // Execute the action after a small delay to ensure UI is ready
    setTimeout(() => {
      if (data.pendingAction === 'export') {
        exportProfiles();
      } else if (data.pendingAction === 'import') {
        (document.getElementById('import-profiles-input') as HTMLInputElement)?.click();
      }
    }, 100);
  }
}

function setupListeners(): void {
  document.getElementById('auto-enable')?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ autoEnable: (e.target as HTMLInputElement).checked });
  });

  document.getElementById('show-badge')?.addEventListener('change', async (e) => {
    await chrome.storage.local.set({ showBadge: (e.target as HTMLInputElement).checked });
    await chrome.runtime.sendMessage({ action: 'updateBadge' });
  });

  // Import/Export
  document.getElementById('export-profiles-btn')?.addEventListener('click', exportProfiles);
  document.getElementById('import-profiles-btn')?.addEventListener('click', () => {
    (document.getElementById('import-profiles-input') as HTMLInputElement)?.click();
  });
  document.getElementById('import-profiles-input')?.addEventListener('change', importProfiles);
}

/**
 * Export profiles to JSON file
 */
function exportProfiles(): void {
  chrome.storage.local.get([STORAGE_KEYS.PROFILES], (data) => {
    const profiles = data[STORAGE_KEYS.PROFILES] || [];
    const dataStr = JSON.stringify(profiles, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `noobheaders-profiles-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);

    showToast(getMessage('profilesExported') || 'Profiles exported successfully', 'success');
  });
}

/**
 * Import profiles from JSON file
 */
async function importProfiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedProfiles: Profile[] = JSON.parse(text);

    if (!Array.isArray(importedProfiles)) {
      showToast(getMessage('invalidProfileFormat'), 'error');
      return;
    }

    // Validate profile structure
    const isValid = importedProfiles.every((profile) => {
      return (
        profile &&
        typeof profile === 'object' &&
        typeof profile.id === 'string' &&
        typeof profile.name === 'string' &&
        typeof profile.enabled === 'boolean' &&
        Array.isArray(profile.headers) &&
        Array.isArray(profile.filters)
      );
    });

    if (!isValid) {
      showToast(getMessage('invalidProfileFormat'), 'error');
      return;
    }

    const confirmed = await showConfirm(
      getMessage('importProfiles'),
      getMessage('confirmImport', String(importedProfiles.length))
    );

    if (confirmed) {
      await chrome.storage.local.set({ [STORAGE_KEYS.PROFILES]: importedProfiles });

      // Select the first profile if profiles were imported
      if (importedProfiles.length > 0) {
        await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE]: importedProfiles[0].id });
      }

      showToast(getMessage('profilesImported') || 'Profiles imported successfully', 'success');
    }
  } catch (error) {
    showToast(getMessage('errorImportingProfiles', (error as Error).message), 'error');
  }

  input.value = '';
}

/**
 * Show toast notification
 */
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span class="toast-message">${message}</span>
  `;

  document.body.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Show confirm dialog
 */
function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'confirm-modal';
    modal.style.display = 'flex';
    modal.style.background = 'rgba(0, 0, 0, 0.5)';
    modal.innerHTML = `
      <div class="modal" style="
        background: var(--background);
        border-radius: 12px;
        padding: 0;
        max-width: 420px;
        width: calc(100% - 40px);
        box-shadow: 0 8px 24px var(--shadow);
      ">
        <div class="modal-header" style="
          padding: 20px;
          border-bottom: 1px solid var(--border);
        ">
          <h3 style="margin: 0; font-size: 18px;">${title}</h3>
        </div>
        <div class="modal-body" style="
          padding: 20px;
        ">
          <p id="confirm-message" style="margin: 0; line-height: 1.5;">${message}</p>
        </div>
        <div class="modal-footer" style="
          padding: 16px 20px;
          border-top: 1px solid var(--border);
          display: flex;
          gap: 8px;
          justify-content: flex-end;
        ">
          <button class="btn-secondary" id="confirm-cancel">Cancel</button>
          <button class="btn-primary" id="confirm-ok">OK</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const handleClick = (confirmed: boolean) => {
      modal.remove();
      resolve(confirmed);
    };

    modal.querySelector('#confirm-ok')?.addEventListener('click', () => handleClick(true));
    modal.querySelector('#confirm-cancel')?.addEventListener('click', () => handleClick(false));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) handleClick(false);
    });
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadOptions();
  setupListeners();
});
