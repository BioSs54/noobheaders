/**
 * NoobHeaders - Options Page
 */

import { getBrowserApi } from './browser-compat.js';
import { updateDebugPanel } from './debug-panel.js';
import { getMessage } from './i18n.js';
import {
  createDefaultProfile,
  generateProfileId,
  mergeProfiles,
  normalizeProfiles,
  STORAGE_KEYS,
} from './types/index.js';
import { createIcon } from './ui-icons.js';

const browserAPI = getBrowserApi();

/** Draft of the popup edits (shared localStorage of the extension pages) */
const POPUP_DRAFT_STATE_KEY = 'noobheaders_popup_draft_state';

interface OptionsData {
  autoEnable?: boolean;
  showBadge?: boolean;
  /** Set by the popup, which cannot reliably show file pickers or downloads */
  pendingAction?: 'import' | 'export';
  /** With `pendingAction: 'export'`: export only this profile */
  pendingExportProfileId?: string;
}

async function loadOptions(): Promise<void> {
  const data = (await browserAPI.storage.local.get(['autoEnable', 'showBadge'])) as OptionsData;

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

  await renderShortcut();
  await runPendingAction();
}

/**
 * Show the current shortcut of the "toggle header modification" command
 */
async function renderShortcut(): Promise<void> {
  const element = document.getElementById('shortcut-value');
  if (!element) return;
  try {
    const commands = await browserAPI.commands.getAll();
    const toggle = commands.find((command) => command.name === 'toggle-header-modification');
    element.textContent = toggle?.shortcut || getMessage('shortcutNotSet');
  } catch {
    element.textContent = getMessage('shortcutNotSet');
  }
}

let pendingActionRunning = false;

/**
 * Run the action requested by the popup (export, import), once
 */
async function runPendingAction(): Promise<void> {
  // The page load and the storage event can both see the same request
  if (pendingActionRunning) return;
  pendingActionRunning = true;
  try {
    await runPendingActionOnce();
  } finally {
    pendingActionRunning = false;
  }
}

async function runPendingActionOnce(): Promise<void> {
  const data = (await browserAPI.storage.local.get([
    'pendingAction',
    'pendingExportProfileId',
  ])) as OptionsData;
  if (!data.pendingAction) return;

  await browserAPI.storage.local.remove(['pendingAction', 'pendingExportProfileId']);

  // Execute the action after a small delay to ensure UI is ready
  setTimeout(() => {
    if (data.pendingAction === 'export') {
      void exportProfiles(data.pendingExportProfileId);
    } else if (data.pendingAction === 'import') {
      (document.getElementById('import-profiles-input') as HTMLInputElement)?.click();
    }
  }, 100);
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
  document
    .getElementById('export-profiles-btn')
    ?.addEventListener('click', () => void exportProfiles());
  document.getElementById('import-profiles-btn')?.addEventListener('click', () => {
    (document.getElementById('import-profiles-input') as HTMLInputElement)?.click();
  });
  document.getElementById('import-profiles-input')?.addEventListener('change', importProfiles);

  // Debug
  document.getElementById('refresh-debug-btn')?.addEventListener('click', () => {
    void updateDebugPanel();
  });
  document.getElementById('clear-all-btn')?.addEventListener('click', () => {
    void clearAllData();
  });

  // The background applies the rules after a storage change: refresh the panel shortly after
  let debugTimer: number | undefined;
  browserAPI.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    // The popup can request an action while this page is already open
    if (changes.pendingAction?.newValue) void runPendingAction();
    window.clearTimeout(debugTimer);
    debugTimer = window.setTimeout(() => void updateDebugPanel(), 300);
  });
}

/**
 * Clear every profile and setting, then start again from the demo profile (switched off)
 */
async function clearAllData(): Promise<void> {
  const choice = await showDialog(getMessage('clearAllData'), getMessage('confirmClearAll'), [
    // Destructive: the safe choice has the focus
    {
      id: 'confirm-cancel',
      label: getMessage('cancel'),
      className: 'btn-secondary',
      initialFocus: true,
    },
    {
      id: 'confirm-ok',
      label: getMessage('confirm'),
      className: 'btn-danger',
      value: 'clear',
    },
  ]);
  if (choice !== 'clear') return;

  try {
    window.localStorage.removeItem(POPUP_DRAFT_STATE_KEY);
  } catch {
    // localStorage can be unavailable
  }
  await browserAPI.storage.local.clear();
  const defaultProfile = createDefaultProfile(generateProfileId());
  await browserAPI.storage.local.set({
    [STORAGE_KEYS.PROFILES]: [defaultProfile],
    [STORAGE_KEYS.ACTIVE_PROFILE]: defaultProfile.id,
    [STORAGE_KEYS.GLOBAL_ENABLED]: false,
  });
  await loadOptions();
  showToast(getMessage('dataCleared'), 'success');
}

function fileNamePart(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'profile'
  );
}

/**
 * Export the profiles (or a single one) to a JSON file that the import accepts
 */
async function exportProfiles(profileId?: string): Promise<void> {
  const data = await browserAPI.storage.local.get([STORAGE_KEYS.PROFILES]);
  const allProfiles = normalizeProfiles(data[STORAGE_KEYS.PROFILES]);
  const single = profileId ? allProfiles.find((profile) => profile.id === profileId) : undefined;
  if (profileId && !single) {
    showToast(getMessage('profileNotFound'), 'error');
    return;
  }
  const profiles = single ? [single] : allProfiles;
  const dataStr = JSON.stringify(profiles, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  const date = new Date().toISOString().slice(0, 10);
  link.download = single
    ? `noobheaders-profile-${fileNamePart(single.name)}-${date}.json`
    : `noobheaders-profiles-${date}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers (Firefox)
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showToast(
    single ? getMessage('profileExported', single.name) : getMessage('profilesExported'),
    'success'
  );
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
      showToast(getMessage('profilesImported'), 'success');
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

      // Say how many were added, and how many got a new name to stay unique
      const added = merged.slice(existing.length);
      const renamed = added.filter(
        (profile, index) => profile.name !== normalizedProfiles[index].name.trim()
      ).length;
      showToast(
        renamed > 0
          ? getMessage('profilesMergedRenamed', [String(added.length), String(renamed)])
          : getMessage('profilesMerged', String(added.length)),
        'success'
      );
    }
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
        // Focus outside the buttons: Tab goes to the first one, Shift+Tab to the last one
        const next =
          index === -1
            ? e.shiftKey
              ? buttons.length - 1
              : 0
            : (index + step + buttons.length) % buttons.length;
        buttons[next].focus();
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
  await updateDebugPanel();
});
