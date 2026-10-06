/**
 * NoobHeaders - Options Page
 */

import { getBrowserApi } from './browser-compat.js';
import { getMessage } from './i18n.js';
import { mergeProfiles, normalizeProfiles, STORAGE_KEYS } from './types/index.js';
import { createIcon } from './ui-icons.js';

const browserAPI = getBrowserApi();

interface OptionsData {
  autoEnable?: boolean;
  showBadge?: boolean;
  pendingAction?: 'import' | 'export';
}

async function loadOptions(): Promise<void> {
  const data = (await browserAPI.storage.local.get([
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
    showBadgeEl.disabled = false;
  }

  const versionEl = document.getElementById('extension-version');
  if (versionEl) {
    try {
      versionEl.textContent = `v${browserAPI.runtime.getManifest().version}`;
    } catch {
      // keep the static fallback
    }
  }

  // Handle pending action from popup
  if (data.pendingAction) {
    // Clear the pending action
    await browserAPI.storage.local.remove('pendingAction');

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
    await browserAPI.storage.local.set({ autoEnable: (e.target as HTMLInputElement).checked });
  });

  document.getElementById('show-badge')?.addEventListener('change', async (e) => {
    // The background refreshes the badge when this setting changes
    await browserAPI.storage.local.set({ showBadge: (e.target as HTMLInputElement).checked });
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
async function exportProfiles(): Promise<void> {
  const data = await browserAPI.storage.local.get([STORAGE_KEYS.PROFILES]);
  const profiles = normalizeProfiles(data[STORAGE_KEYS.PROFILES]);
  const dataStr = JSON.stringify(profiles, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `noobheaders-profiles-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers (Firefox)
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast(getMessage('profilesExported'), 'success');
}

function isImportableProfile(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;
  const candidate = profile as Record<string, unknown>;
  return (
    (typeof candidate.id === 'string' || typeof candidate.id === 'undefined') &&
    typeof candidate.name === 'string' &&
    candidate.name.trim() !== '' &&
    (typeof candidate.enabled === 'boolean' || typeof candidate.enabled === 'undefined') &&
    Array.isArray(candidate.headers) &&
    Array.isArray(candidate.filters)
  );
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
    const importedProfiles = JSON.parse(text) as unknown;

    if (!Array.isArray(importedProfiles) || !importedProfiles.every(isImportableProfile)) {
      showToast(getMessage('invalidProfileFormat'), 'error');
      return;
    }

    if (importedProfiles.length === 0) {
      showToast(getMessage('importEmpty'), 'error');
      return;
    }

    // Adding is the default choice: it never loses existing profiles
    const choice = await showDialog(
      getMessage('importProfiles'),
      getMessage('confirmImport', String(importedProfiles.length)),
      [
        { id: 'confirm-cancel', label: getMessage('cancel'), className: 'btn-secondary' },
        {
          id: 'confirm-ok',
          label: getMessage('importReplace'),
          className: 'btn-danger',
          value: 'replace',
        },
        {
          id: 'import-merge',
          label: getMessage('importMerge'),
          className: 'btn-primary',
          value: 'merge',
          initialFocus: true,
        },
      ]
    );

    if (!choice) return;

    const normalizedProfiles = normalizeProfiles(importedProfiles);

    if (choice === 'replace') {
      await browserAPI.storage.local.set({
        [STORAGE_KEYS.PROFILES]: normalizedProfiles,
        [STORAGE_KEYS.ACTIVE_PROFILE]: normalizedProfiles[0].id,
      });
    } else {
      const current = await browserAPI.storage.local.get([
        STORAGE_KEYS.PROFILES,
        STORAGE_KEYS.ACTIVE_PROFILE,
      ]);
      const existing = normalizeProfiles(current[STORAGE_KEYS.PROFILES]);
      const merged = mergeProfiles(existing, normalizedProfiles);
      // Keep the selected profile; select the first one when nothing valid was selected
      const activeId = current[STORAGE_KEYS.ACTIVE_PROFILE];
      const hasActive = merged.some((profile) => profile.id === activeId);
      await browserAPI.storage.local.set({
        [STORAGE_KEYS.PROFILES]: merged,
        [STORAGE_KEYS.ACTIVE_PROFILE]: hasActive ? activeId : merged[0].id,
      });
    }

    showToast(getMessage('profilesImported'), 'success');
  } catch (error) {
    showToast(getMessage('errorImportingProfiles', (error as Error).message), 'error');
  } finally {
    // Allow selecting the same file again
    input.value = '';
  }
}

/**
 * Show toast notification
 */
function showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  const container = document.getElementById('toast-container') ?? document.body;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.appendChild(
    createIcon(
      type === 'success' ? 'check' : type === 'error' ? 'x-mark' : 'info',
      'ui-icon ui-icon--sm'
    )
  );

  const text = document.createElement('span');
  text.className = 'toast-message';
  text.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(text);

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

interface DialogAction<T extends string> {
  id: string;
  label: string;
  className: string;
  /** Value resolved when clicked; no value means "cancel" (resolves null) */
  value?: T;
  initialFocus?: boolean;
}

/**
 * Show a dialog with several actions (built with DOM APIs: messages are never parsed as HTML).
 * Resolves the value of the clicked action, or null when cancelled (Escape, overlay, cancel).
 */
function showDialog<T extends string>(
  title: string,
  message: string,
  actionList: DialogAction<T>[]
): Promise<T | null> {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement as HTMLElement | null;

    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'confirm-modal';
    modal.style.display = 'flex';

    const content = document.createElement('div');
    content.className = 'modal-content';
    content.setAttribute('role', 'alertdialog');
    content.setAttribute('aria-modal', 'true');
    content.setAttribute('aria-labelledby', 'confirm-title');
    content.setAttribute('aria-describedby', 'confirm-message');

    const titleEl = document.createElement('h3');
    titleEl.id = 'confirm-title';
    titleEl.className = 'modal-title';
    titleEl.textContent = title;

    const messageEl = document.createElement('p');
    messageEl.id = 'confirm-message';
    messageEl.className = 'modal-message';
    messageEl.textContent = message;

    const actions = document.createElement('div');
    actions.className = 'modal-actions';

    const close = (value: T | null) => {
      document.removeEventListener('keydown', handleKeydown);
      modal.remove();
      previousFocus?.focus();
      resolve(value);
    };

    const buttons = actionList.map((action) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = action.id;
      button.className = action.className;
      button.textContent = action.label;
      button.addEventListener('click', () => close(action.value ?? null));
      actions.appendChild(button);
      return button;
    });

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close(null);
      } else if (e.key === 'Tab') {
        // Keep focus inside the dialog
        e.preventDefault();
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const step = e.shiftKey ? -1 : 1;
        buttons[(index + step + buttons.length) % buttons.length].focus();
      }
    };

    content.append(titleEl, messageEl, actions);
    modal.appendChild(content);
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) close(null);
    });
    document.addEventListener('keydown', handleKeydown);

    const initial = actionList.findIndex((action) => action.initialFocus);
    buttons[initial === -1 ? buttons.length - 1 : initial].focus();
  });
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadOptions();
  setupListeners();
});
