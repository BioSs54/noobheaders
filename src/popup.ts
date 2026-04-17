/**
 * NoobHeaders - Popup UI Logic
 */

import { isValidDomain } from './auto-switch.js';
import { getBrowserApi } from './browser-compat.js';
import {
  clearSelection,
  getSelectedFilter,
  selectFilter as selectFilterIndex,
} from './filter-selection.js';
import { detectFilterType } from './filter-utils.js';
import { getMessage } from './i18n.js';
import type { Filter, Header, Profile } from './types/index.js';
import { STORAGE_KEYS, createDefaultProfile, normalizeProfiles } from './types/index.js';
import { createIcon, replaceWithIcon } from './ui-icons.js';

const browserAPI = getBrowserApi();
const EASTER_EGG_TRIGGER_COUNT = 3;
const EASTER_EGG_RESET_DELAY_MS = 1200;
const EASTER_EGG_DURATION_MS = 300000;
const NOOB_MODE_UNTIL_KEY = 'noobheaders_noob_mode_until';
const POPUP_DRAFT_STATE_KEY = 'noobheaders_popup_draft_state';

let profiles: Profile[] = [];
let activeProfileId: string | null = null;
let globalEnabled = false;

// Debounce timer for extension sync after text input updates
let saveTimer: number | null = null;
let saveQueued = false;
let saveInFlightPromise: Promise<void> | null = null;

// Flag to prevent re-rendering when popup itself updates storage
let isUpdatingStorage = false;
let easterEggClickCount = 0;
let easterEggResetTimer: number | null = null;
let noobModeCountdownTimer: number | null = null;
let noobModeUntil = 0;

function persistDraftState(): void {
  try {
    window.localStorage.setItem(
      POPUP_DRAFT_STATE_KEY,
      JSON.stringify({
        profiles,
        activeProfileId,
        globalEnabled,
      })
    );
  } catch (error) {
    console.warn('Failed to persist popup draft state', error);
  }
}

function consumeDraftState(): {
  profiles: Profile[];
  activeProfileId: string | null;
  globalEnabled: boolean;
} | null {
  try {
    const rawDraft = window.localStorage.getItem(POPUP_DRAFT_STATE_KEY);
    if (!rawDraft) {
      return null;
    }

    const parsedDraft = JSON.parse(rawDraft) as {
      profiles?: unknown;
      activeProfileId?: string | null;
      globalEnabled?: boolean;
    };

    window.localStorage.removeItem(POPUP_DRAFT_STATE_KEY);

    return {
      profiles: normalizeProfiles(parsedDraft.profiles),
      activeProfileId:
        typeof parsedDraft.activeProfileId === 'string' ? parsedDraft.activeProfileId : null,
      globalEnabled: Boolean(parsedDraft.globalEnabled),
    };
  } catch (error) {
    console.warn('Failed to restore popup draft state', error);
    return null;
  }
}

function clearDraftState(): void {
  try {
    window.localStorage.removeItem(POPUP_DRAFT_STATE_KEY);
  } catch (error) {
    console.warn('Failed to clear popup draft state', error);
  }
}

/**
 * Show toast notification
 */
function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;

  const icon = document.createElement('span');
  icon.className = 'toast-icon';
  icon.appendChild(
    createIcon(
      type === 'success' ? 'check' : type === 'error' ? 'x-mark' : 'alert',
      'ui-icon ui-icon--sm'
    )
  );

  const messageEl = document.createElement('span');
  messageEl.className = 'toast-message';
  messageEl.textContent = message;

  toast.appendChild(icon);
  toast.appendChild(messageEl);
  container.appendChild(toast);

  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Show confirmation modal
 */
function showConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirm-modal');
    const titleEl = document.getElementById('confirm-title');
    const messageEl = document.getElementById('confirm-message');
    const okBtn = document.getElementById('confirm-ok');
    const cancelBtn = document.getElementById('confirm-cancel');

    if (!modal || !titleEl || !messageEl || !okBtn || !cancelBtn) {
      resolve(false);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
    };

    const handleOk = () => {
      cleanup();
      resolve(true);
    };

    const handleCancel = () => {
      cleanup();
      resolve(false);
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    });
  });
}

/**
 * Show prompt modal
 */
function showPrompt(title: string, message: string, defaultValue = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById('prompt-modal');
    const titleEl = document.getElementById('prompt-title');
    const messageEl = document.getElementById('prompt-message');
    const input = document.getElementById('prompt-input') as HTMLInputElement;
    const okBtn = document.getElementById('prompt-ok');
    const cancelBtn = document.getElementById('prompt-cancel');

    if (!modal || !titleEl || !messageEl || !input || !okBtn || !cancelBtn) {
      resolve(null);
      return;
    }

    titleEl.textContent = title;
    messageEl.textContent = message;
    input.value = defaultValue;
    modal.style.display = 'flex';

    // Focus input and select text
    setTimeout(() => {
      input.focus();
      input.select();
    }, 50);

    const cleanup = () => {
      modal.style.display = 'none';
      okBtn.removeEventListener('click', handleOk);
      cancelBtn.removeEventListener('click', handleCancel);
      input.removeEventListener('keydown', handleKeydown);
    };

    const handleOk = () => {
      const value = input.value.trim();
      cleanup();
      resolve(value || null);
    };

    const handleCancel = () => {
      cleanup();
      resolve(null);
    };

    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleOk();
      } else if (e.key === 'Escape') {
        handleCancel();
      }
    };

    okBtn.addEventListener('click', handleOk);
    cancelBtn.addEventListener('click', handleCancel);
    input.addEventListener('keydown', handleKeydown);

    // Close on overlay click
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        handleCancel();
      }
    });
  });
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get active profile
 */
function getActiveProfile(): Profile | undefined {
  return profiles.find((p) => p.id === activeProfileId);
}

/**
 * Load state from storage
 */
async function loadState(): Promise<void> {
  const data = await browserAPI.storage.local.get([
    STORAGE_KEYS.PROFILES,
    STORAGE_KEYS.ACTIVE_PROFILE,
    STORAGE_KEYS.GLOBAL_ENABLED,
  ]);

  // Deep clone profiles to avoid shared references
  const storedProfiles = normalizeProfiles(data[STORAGE_KEYS.PROFILES]);
  profiles = JSON.parse(JSON.stringify(storedProfiles));
  activeProfileId = (data[STORAGE_KEYS.ACTIVE_PROFILE] as string) || null;
  globalEnabled = (data[STORAGE_KEYS.GLOBAL_ENABLED] as boolean) || false;

  // Create default profile if none exist
  if (profiles.length === 0) {
    const defaultProfile: Profile = createDefaultProfile(generateId());
    profiles = [defaultProfile];
    activeProfileId = defaultProfile.id;
    await saveState();
  }

  const draftState = consumeDraftState();
  if (draftState) {
    profiles = JSON.parse(JSON.stringify(draftState.profiles));
    activeProfileId = draftState.activeProfileId;
    globalEnabled = draftState.globalEnabled;
    await saveState();
    await syncExtensionState();
  }

  // Update UI
  const globalToggle = document.getElementById('global-enabled') as HTMLInputElement;
  if (globalToggle) {
    globalToggle.checked = globalEnabled;
  }
}

/**
 * Save state to storage
 */
async function saveState(): Promise<void> {
  try {
    if (!browserAPI.storage || !browserAPI.storage.local || !browserAPI.storage.local.set) {
      throw new Error('browserAPI.storage.local.set is not available');
    }
    isUpdatingStorage = true;
    await browserAPI.storage.local.set({
      [STORAGE_KEYS.PROFILES]: profiles,
      [STORAGE_KEYS.ACTIVE_PROFILE]: activeProfileId,
      [STORAGE_KEYS.GLOBAL_ENABLED]: globalEnabled,
    });
    clearDraftState();
    // Reset flag after a short delay to catch the storage change event
    setTimeout(() => {
      isUpdatingStorage = false;
    }, 100);
  } catch (err) {
    console.error('saveState failed:', err);
    isUpdatingStorage = false;
    throw new Error(`saveState failed: ${(err as Error).message}`);
  }
}

async function saveStateImmediately(): Promise<void> {
  if (saveInFlightPromise) {
    saveQueued = true;
    await saveInFlightPromise;
    return;
  }

  saveInFlightPromise = (async () => {
    do {
      saveQueued = false;
      await saveState();
    } while (saveQueued);
  })();

  try {
    await saveInFlightPromise;
  } finally {
    saveInFlightPromise = null;
  }
}

interface PersistOptions {
  refresh?: boolean;
  syncExtension?: boolean;
}

function getCurrentStateSnapshot() {
  return {
    profiles: JSON.stringify(profiles),
    activeProfileId: activeProfileId ?? null,
    globalEnabled,
  };
}

function matchesCurrentState(changes: { [key: string]: chrome.storage.StorageChange }): boolean {
  const current = getCurrentStateSnapshot();

  if (changes[STORAGE_KEYS.PROFILES]) {
    const nextProfiles = JSON.stringify(normalizeProfiles(changes[STORAGE_KEYS.PROFILES].newValue));
    if (nextProfiles !== current.profiles) {
      return false;
    }
  }

  if (changes[STORAGE_KEYS.ACTIVE_PROFILE]) {
    if ((changes[STORAGE_KEYS.ACTIVE_PROFILE].newValue ?? null) !== current.activeProfileId) {
      return false;
    }
  }

  if (changes[STORAGE_KEYS.GLOBAL_ENABLED]) {
    if (Boolean(changes[STORAGE_KEYS.GLOBAL_ENABLED].newValue) !== current.globalEnabled) {
      return false;
    }
  }

  return true;
}

async function syncExtensionState(): Promise<void> {
  await browserAPI.runtime.sendMessage({
    action: 'updateRules',
    state: {
      profiles,
      activeProfileId,
      globalEnabled,
    },
  });
  await browserAPI.runtime.sendMessage({ action: 'updateBadge' });
  await updateDebugInfo();
}

async function getBackgroundDebugState(): Promise<any | null> {
  try {
    return await browserAPI.runtime.sendMessage({ action: 'getDebugState' });
  } catch (error) {
    console.warn('Failed to read background debug state', error);
    return null;
  }
}

async function persistPopupState(options: PersistOptions = {}): Promise<void> {
  const { refresh = false, syncExtension = false } = options;

  await saveState();

  if (syncExtension) {
    await syncExtensionState();
  }

  if (refresh) {
    await refreshPopupUi();
  }
}

async function flushPendingSave(syncExtension = true): Promise<void> {
  await saveStateImmediately();

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  if (syncExtension) {
    await syncExtensionState();
  }
}

/**
 * Save to storage immediately, but debounce extension rule updates while typing
 */
function scheduleSave(delay = 500): void {
  persistDraftState();
  void saveStateImmediately();

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(async () => {
    try {
      await syncExtensionState();
    } finally {
      saveTimer = null;
    }
  }, delay);
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Global toggle
  document.getElementById('global-enabled')?.addEventListener('change', toggleGlobalEnabled);

  // Profile controls
  document.getElementById('add-profile-btn')?.addEventListener('click', addProfile);
  document.getElementById('delete-profile-btn')?.addEventListener('click', deleteProfile);
  document.getElementById('rename-profile-btn')?.addEventListener('click', renameProfile);
  document.getElementById('duplicate-profile-btn')?.addEventListener('click', duplicateProfile);

  // Header controls
  document.getElementById('add-header-btn')?.addEventListener('click', addHeader);

  // Filter controls
  document.getElementById('add-filter-btn')?.addEventListener('click', addFilter);

  // Debug
  document.getElementById('toggle-debug-btn')?.addEventListener('click', toggleDebug);
  document.getElementById('clear-all-btn')?.addEventListener('click', clearAllData);

  // Options
  document.getElementById('options-btn')?.addEventListener('click', () => {
    browserAPI.runtime.openOptionsPage();
  });

  // Easter egg
  document.getElementById('easter-egg-trigger')?.addEventListener('click', triggerEasterEgg);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushPendingSave();
    }
  });

  window.addEventListener('pagehide', () => {
    void flushPendingSave();
  });
}

/**
 * Render profiles dropdown
 */
function renderProfiles(): void {
  const radioGroup = document.getElementById('profiles-radio') as HTMLDivElement;
  if (!radioGroup) return;

  radioGroup.innerHTML = '';

  profiles.forEach((profile) => {
    const row = document.createElement('div');
    row.className = 'profile-row';

    const main = document.createElement('div');
    main.className = 'profile-row-main';

    const copy = document.createElement('div');
    copy.className = 'profile-row-copy';

    const headline = document.createElement('div');
    headline.className = 'profile-row-headline';

    // Clickable name selects the profile (accessible)
    const nameBtn = document.createElement('button');
    nameBtn.className = 'btn-link profile-name-btn';
    nameBtn.type = 'button';
    nameBtn.textContent = profile.name;
    nameBtn.title = browserAPI.i18n.getMessage('activeProfile') || 'Active Profile';
    nameBtn.addEventListener('click', async () => {
      await activateProfile(profile.id);
    });

    // Small toggle to enable/disable profile
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-container mini';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.className = 'toggle-input';
    toggleInput.checked = !!profile.enabled;
    toggleInput.addEventListener('change', async (e) => {
      profile.enabled = (e.target as HTMLInputElement).checked;
      await activateProfile(profile.id);
    });

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'toggle-slider';

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    const meta = document.createElement('div');
    meta.className = 'profile-row-meta';
    meta.textContent = `${profile.headers?.length || 0} ${getMessage('headers')} • ${profile.filters?.length || 0} ${getMessage('filters')}`;

    if (profile.id === activeProfileId) {
      const badge = document.createElement('span');
      badge.className = 'profile-status-badge';
      badge.textContent = (getMessage('profileActivePrefix') || 'Selected')
        .replace(/\s*:\s*$/, '')
        .trim();
      headline.appendChild(badge);
      row.classList.add('active');
    } else {
      row.classList.remove('active');
    }

    headline.appendChild(nameBtn);
    copy.appendChild(headline);
    copy.appendChild(meta);
    main.appendChild(toggleLabel);
    main.appendChild(copy);
    row.appendChild(main);

    radioGroup.appendChild(row);
  });

  // Update delete button state
  const deleteBtn = document.getElementById('delete-profile-btn') as HTMLButtonElement;
  if (deleteBtn) {
    deleteBtn.disabled = profiles.length <= 1;
  }

  // Update active profile display elsewhere in the UI
  updateActiveProfileDisplay();
}

/**
 * Update the small divider that shows the active profile name
 */
function updateActiveProfileDisplay(): void {
  const nameEl = document.getElementById('active-profile-name');
  const container = document.getElementById('active-profile-display');
  const renameBtn = document.getElementById('rename-profile-btn') as HTMLButtonElement | null;
  const duplicateBtn = document.getElementById('duplicate-profile-btn') as HTMLButtonElement | null;
  const active = getActiveProfile();
  if (container) {
    container.style.display = active ? 'flex' : 'none';
  }
  if (nameEl) {
    nameEl.textContent = active ? active.name : '';
  }
  if (renameBtn) {
    renameBtn.disabled = !active;
  }
  if (duplicateBtn) {
    duplicateBtn.disabled = !active;
  }
}

function refreshProfileViews(): void {
  renderProfiles();
  renderHeaders();
  renderFilters();
  renderFilterEditor();
}

async function refreshPopupUi(): Promise<void> {
  refreshProfileViews();
  await updateDebugInfo();
}

async function activateProfile(profileId: string, persist = true): Promise<void> {
  activeProfileId = profileId;

  if (persist) {
    await saveState();
    await syncExtensionState();
  }

  await refreshPopupUi();
}

/**
 * Render selected filter editor
 */
function renderFilterEditor(): void {
  const editor = document.getElementById('filter-editor') as HTMLElement | null;
  const activeProfile = getActiveProfile();
  if (!editor || !activeProfile) return;

  const sel = getSelectedFilter(activeProfileId);
  if (sel === null || sel < 0 || sel >= (activeProfile.filters?.length || 0)) {
    editor.style.display = 'none';
    return;
  }

  const filter = activeProfile.filters[sel];
  // Populate editor fields
  const valueEl = document.getElementById('editor-filter-value') as HTMLInputElement;
  const saveBtn = document.getElementById('editor-save-btn') as HTMLButtonElement;
  const deleteBtn = document.getElementById('editor-delete-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('editor-cancel-btn') as HTMLButtonElement;

  valueEl.value = filter.value || '';

  // Wire actions
  saveBtn.onclick = async () => {
    setFilterType(sel, detectFilterType(valueEl.value));
    setFilterValue(sel, valueEl.value);
    await saveState();
    await refreshPopupUi();
    editor.style.display = 'none';
  };

  deleteBtn.onclick = async () => {
    await deleteFilter(sel);
    clearSelection(activeProfileId);
    editor.style.display = 'none';
  };

  cancelBtn.onclick = () => {
    clearSelection(activeProfileId);
    editor.style.display = 'none';
    renderFilters();
  };

  editor.style.display = 'block';
}

/**
 * Render headers list
 */
function renderHeaders(): void {
  // ensure active profile display is current
  updateActiveProfileDisplay();
  const container = document.getElementById('headers-list');
  const emptyState = document.getElementById('empty-headers') as HTMLElement;
  const activeProfile = getActiveProfile();

  if (!container || !emptyState) return;

  container.innerHTML = '';

  if (!activeProfile || !activeProfile.headers || activeProfile.headers.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  // Preserve focus/selection in header inputs across re-renders
  const active = document.activeElement as HTMLElement | null;
  let focusedIndex: string | null = null;
  let focusedField: string | null = null;
  let selStart: number | null = null;
  let selEnd: number | null = null;

  if (active?.closest?.('#headers-list')) {
    const idx = (active as HTMLElement).getAttribute('data-index');
    const field = (active as HTMLElement).getAttribute('data-field');
    if (idx && field) {
      focusedIndex = idx;
      focusedField = field;
      if ((active as HTMLInputElement).selectionStart !== null) {
        selStart = (active as HTMLInputElement).selectionStart;
        selEnd = (active as HTMLInputElement).selectionEnd;
      }
    }
  }

  activeProfile.headers.forEach((header, index) => {
    const headerEl = createHeaderElement(header, index);
    container.appendChild(headerEl);
  });

  // Restore focus and selection if possible
  if (focusedIndex !== null && focusedField !== null) {
    const selector = `input[data-index="${focusedIndex}"][data-field="${focusedField}"]`;
    const el = container.querySelector(selector) as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (selStart !== null && selEnd !== null) {
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch (e) {
          // ignore if unavailable
        }
      }
    }
  }
}

/**
 * Create header element
 */
function createHeaderElement(header: Header, index: number): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'header-item';

  // Toggle
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-container mini';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.className = 'toggle-input';
  toggleInput.checked = header.enabled;
  // prevent clicks on the toggle from bubbling to the row
  toggleInput.addEventListener('click', (e) => e.stopPropagation());
  toggleInput.addEventListener('change', () => toggleHeader(index));

  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';
  toggleLabel.addEventListener('click', (e) => e.stopPropagation());

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);

  // Type select
  const typeSelect = document.createElement('select');
  typeSelect.className = 'header-type';
  typeSelect.addEventListener('change', (e) =>
    updateHeaderType(index, (e.target as HTMLSelectElement).value as 'request' | 'response')
  );

  const requestOption = document.createElement('option');
  requestOption.value = 'request';
  requestOption.textContent = browserAPI.i18n.getMessage('request');
  requestOption.selected = header.type === 'request';

  const responseOption = document.createElement('option');
  responseOption.value = 'response';
  responseOption.textContent = browserAPI.i18n.getMessage('response');
  responseOption.selected = header.type === 'response';

  typeSelect.appendChild(requestOption);
  typeSelect.appendChild(responseOption);

  // Name input
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'header-name';
  nameInput.placeholder = browserAPI.i18n.getMessage('headerName');
  nameInput.value = header.name || '';
  // mark for focus preservation
  nameInput.setAttribute('data-index', index.toString());
  nameInput.setAttribute('data-field', 'name');
  nameInput.addEventListener('input', (e) =>
    updateHeaderName(index, (e.target as HTMLInputElement).value)
  );
  nameInput.addEventListener('blur', () => {
    void flushPendingSave();
  });

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'header-value';
  valueInput.placeholder = browserAPI.i18n.getMessage('headerValue');
  valueInput.value = header.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) =>
    updateHeaderValue(index, (e.target as HTMLInputElement).value)
  );
  valueInput.addEventListener('blur', () => {
    void flushPendingSave();
  });

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete-btn';
  deleteBtn.title = browserAPI.i18n.getMessage('delete');
  deleteBtn.setAttribute('aria-label', deleteBtn.title);
  deleteBtn.appendChild(createIcon('trash', 'ui-icon ui-icon--sm'));
  deleteBtn.addEventListener('click', () => deleteHeader(index));

  div.appendChild(toggleLabel);
  div.appendChild(typeSelect);
  div.appendChild(nameInput);
  div.appendChild(valueInput);
  div.appendChild(deleteBtn);

  return div;
}

/**
 * Render filters list
 */
function renderFilters(): void {
  // ensure active profile display is current
  updateActiveProfileDisplay();
  const container = document.getElementById('filters-list');
  const emptyState = document.getElementById('empty-filters') as HTMLElement;
  const activeProfile = getActiveProfile();

  if (!container || !emptyState) return;

  container.innerHTML = '';

  if (!activeProfile || !activeProfile.filters || activeProfile.filters.length === 0) {
    emptyState.style.display = 'block';
    // hide editor when there are no filters
    const editor = document.getElementById('filter-editor') as HTMLElement | null;
    if (editor) editor.style.display = 'none';
    return;
  }

  emptyState.style.display = 'none';

  // Preserve focus/selection in filter inputs across re-renders
  const active = document.activeElement as HTMLElement | null;
  let focusedIndex: string | null = null;
  let focusedField: string | null = null;
  let selStart: number | null = null;
  let selEnd: number | null = null;

  if (active?.closest?.('#filters-list')) {
    const idx = (active as HTMLElement).getAttribute('data-index');
    const field = (active as HTMLElement).getAttribute('data-field');
    if (idx && field) {
      focusedIndex = idx;
      focusedField = field;
      if ((active as HTMLInputElement).selectionStart !== null) {
        selStart = (active as HTMLInputElement).selectionStart;
        selEnd = (active as HTMLInputElement).selectionEnd;
      }
    }
  }

  activeProfile.filters.forEach((filter, index) => {
    const filterEl = createFilterElement(filter, index);
    // highlight if selected
    if (getSelectedFilter(activeProfileId) === index) filterEl.classList.add('selected');
    filterEl.addEventListener('click', (e) => {
      // if the click originated from an interactive child (input/select/button), do nothing
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.closest('input') || target.closest('select') || target.closest('button'))
      ) {
        return;
      }

      // select this filter and focus inline value input (inline editing)
      selectFilterIndex(activeProfileId, index);
      renderFilters();
      // focus the input after re-render
      const selector = `input[data-index="${index}"][data-field="value"]`;
      const el = container.querySelector(selector) as HTMLInputElement | null;
      if (el) {
        el.focus();
        try {
          el.select();
        } catch (e) {
          // ignore
        }
      }
    });
    container.appendChild(filterEl);
  });

  // Restore focus and selection if possible
  if (focusedIndex !== null && focusedField !== null) {
    const selector = `input[data-index="${focusedIndex}"][data-field="${focusedField}"]`;
    const el = container.querySelector(selector) as HTMLInputElement | null;
    if (el) {
      el.focus();
      if (selStart !== null && selEnd !== null) {
        try {
          el.setSelectionRange(selStart, selEnd);
        } catch (e) {
          // ignore if unavailable
        }
      }
    }
  }
}

/**
 * Create filter element
 */
function createFilterElement(filter: Filter, index: number): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'filter-item';

  // Toggle
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-container mini';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.className = 'toggle-input';
  toggleInput.checked = filter.enabled;
  // ensure clicking the toggle doesn't bubble up to the row click handler
  toggleInput.addEventListener('click', (e) => {
    e.stopPropagation();
  });
  toggleInput.addEventListener('change', () => toggleFilter(index));

  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';
  // also prevent label clicks from bubbling
  toggleLabel.addEventListener('click', (e) => e.stopPropagation());

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);

  // Type is detected automatically by input heuristics; we don't show a type select to simplify the UI
  const typeSelect = document.createElement('select');
  typeSelect.className = 'filter-type';
  typeSelect.style.display = 'none';
  // mark for focus preservation
  typeSelect.setAttribute('data-index', index.toString());
  typeSelect.setAttribute('data-field', 'type');
  // keep listener for internal updates only
  typeSelect.addEventListener('change', (e) =>
    updateFilterType(index, (e.target as HTMLSelectElement).value as 'url' | 'domain')
  );

  const urlOption = document.createElement('option');
  urlOption.value = 'url';
  urlOption.textContent = browserAPI.i18n.getMessage('urlPattern');
  urlOption.selected = filter.type === 'url';

  const domainOption = document.createElement('option');
  domainOption.value = 'domain';
  domainOption.textContent = browserAPI.i18n.getMessage('domain');
  domainOption.selected = filter.type === 'domain';

  typeSelect.appendChild(urlOption);
  typeSelect.appendChild(domainOption);

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'filter-value';
  valueInput.placeholder = browserAPI.i18n.getMessage('filterValuePlaceholder');
  valueInput.value = filter.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    setFilterValue(index, v);
    scheduleSave();

    // Detect type automatically and update stored type
    const detected = detectFilterType(v);
    if (detected !== typeSelect.value) {
      setFilterType(index, detected);
      typeSelect.value = detected;
      scheduleSave();
    }

    // inline validation for domain filters
    const effectiveType = typeSelect.value as 'url' | 'domain';
    const isValid = effectiveType !== 'domain' ? true : isValidDomain(v);
    // toggle disable if invalid
    toggleInput.disabled = !isValid;
    if (!isValid) {
      div.classList.add('invalid');
      errorSpan.style.display = 'block';
    } else {
      div.classList.remove('invalid');
      errorSpan.style.display = 'none';
    }
  });
  // prevent clicks on the input from bubbling up to the row (avoids immediate rerender)
  valueInput.addEventListener('click', (e) => e.stopPropagation());
  valueInput.addEventListener('focus', (e) => e.stopPropagation());
  valueInput.addEventListener('blur', () => {
    void flushPendingSave();
  });

  // Edit button (opens editor panel)
  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.title = browserAPI.i18n.getMessage('edit') || 'Edit';
  editBtn.setAttribute('aria-label', editBtn.title);
  editBtn.appendChild(createIcon('edit', 'ui-icon ui-icon--sm'));
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFilterIndex(activeProfileId, index);
    renderFilters();
    renderFilterEditor();
  });

  // Error span for invalid domain
  const errorSpan = document.createElement('span');
  errorSpan.className = 'field-error';
  errorSpan.style.display = 'none';
  errorSpan.textContent = browserAPI.i18n.getMessage('invalidDomain');

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete-btn';
  deleteBtn.title = browserAPI.i18n.getMessage('delete');
  deleteBtn.setAttribute('aria-label', deleteBtn.title);
  deleteBtn.appendChild(createIcon('trash', 'ui-icon ui-icon--sm'));
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteFilter(index);
  });

  div.appendChild(toggleLabel);
  div.appendChild(typeSelect);
  div.appendChild(valueInput);
  div.appendChild(errorSpan);
  div.appendChild(editBtn);
  div.appendChild(deleteBtn);

  // initial validation and detection
  const initialDetected = detectFilterType(filter.value || '');
  const effectiveInitialType = filter.type || initialDetected;
  typeSelect.value = effectiveInitialType;

  const initialValid = effectiveInitialType !== 'domain' ? true : isValidDomain(filter.value || '');
  if (!initialValid) {
    div.classList.add('invalid');
    toggleInput.disabled = true;
    errorSpan.style.display = 'block';
  }

  return div;
}

/**
 * Add new profile
 */
async function addProfile(): Promise<void> {
  const name = await showPrompt(getMessage('addProfile'), getMessage('enterProfileName'));
  if (!name) return;

  const newProfile: Profile = {
    id: generateId(),
    name: name.trim(),
    headers: [],
    filters: [],
  };

  profiles.push(newProfile);
  activeProfileId = newProfile.id;

  // If user opted to auto-enable profiles, mark new profile as enabled
  const { autoEnable } = (await browserAPI.storage.local.get('autoEnable')) as {
    autoEnable?: boolean;
  };
  if (autoEnable) {
    newProfile.enabled = true;
  }

  await persistPopupState({ refresh: true });
  showToast(getMessage('profileAdded') || 'Profile added successfully', 'success');
}

/**
 * Delete profile
 */
async function deleteProfile(): Promise<void> {
  if (profiles.length <= 1) {
    showToast(getMessage('cannotDeleteLastProfile'), 'warning');
    return;
  }

  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  const confirmed = await showConfirm(
    getMessage('deleteProfile'),
    getMessage('confirmDeleteProfile', activeProfile.name)
  );
  if (!confirmed) return;

  profiles = profiles.filter((p) => p.id !== activeProfileId);
  clearSelection(activeProfileId);
  activeProfileId = profiles[0].id;
  await persistPopupState({ refresh: true });
  showToast(getMessage('profileDeleted') || 'Profile deleted', 'success');
}

/**
 * Rename profile
 */
async function renameProfile(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  const newName = await showPrompt(
    getMessage('rename'),
    getMessage('enterNewName'),
    activeProfile.name
  );
  if (!newName) return;

  activeProfile.name = newName.trim();
  await persistPopupState({ refresh: true });
  showToast(getMessage('profileRenamed') || 'Profile renamed', 'success');
}

/**
 * Duplicate profile
 */
async function duplicateProfile(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  const newProfile: Profile = {
    ...JSON.parse(JSON.stringify(activeProfile)),
    id: generateId(),
    name: `${activeProfile.name} (Copy)`,
  };

  profiles.push(newProfile);
  activeProfileId = newProfile.id;
  await persistPopupState({ refresh: true });
}

/**
 * Toggle global enabled state
 */
async function toggleGlobalEnabled(e: Event): Promise<void> {
  globalEnabled = (e.target as HTMLInputElement).checked;
  await persistPopupState({ syncExtension: true });
}

/**
 * Add header
 */
async function addHeader(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  if (!activeProfile.headers) {
    activeProfile.headers = [];
  }

  activeProfile.headers.push({
    enabled: true,
    type: 'request',
    name: '',
    value: '',
  });

  await persistPopupState({ refresh: true });
}

/**
 * Toggle header
 */
async function toggleHeader(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].enabled = !activeProfile.headers[index].enabled;
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Update header type
 */
async function updateHeaderType(index: number, type: 'request' | 'response'): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].type = type;
  await persistPopupState({ syncExtension: true });
}

/**
 * Update header name
 */
async function updateHeaderName(index: number, name: string): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].name = name;
  persistDraftState();
  // Debounce writes to avoid re-rendering on every keystroke
  scheduleSave();
}

/**
 * Update header value
 */
async function updateHeaderValue(index: number, value: string): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].value = value;
  persistDraftState();
  scheduleSave();
}

/**
 * Delete header
 */
async function deleteHeader(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;
  activeProfile.headers.splice(index, 1);
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Add filter
 */
async function addFilter(): Promise<void> {
  try {
    const activeProfile = getActiveProfile();
    if (!activeProfile) {
      console.warn('No active profile found when adding filter');
      return;
    }

    if (!activeProfile.filters) {
      activeProfile.filters = [];
    }

    activeProfile.filters.push({
      enabled: true,
      type: 'url',
      value: '',
    });

    try {
      await persistPopupState({ refresh: true });
    } catch (err) {
      console.error('addFilter: saveState failed', err);
      // Inform the user with the underlying error message for easier debugging
      showToast(
        `${getMessage('errorAddingFilter') || 'Failed to add filter'}: ${(err as Error).message}`,
        'error'
      );
      // Still render UI to reflect in-memory change
      refreshProfileViews();
      return;
    }
  } catch (err) {
    console.error('Failed to add filter', err);
    showToast(getMessage('errorAddingFilter') || 'Failed to add filter', 'error');
  }
}

/**
 * Toggle filter
 */
async function toggleFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].enabled = !activeProfile.filters[index].enabled;
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Update filter type
 */
function setFilterType(index: number, type: 'url' | 'domain'): void {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].type = type;
}

async function updateFilterType(index: number, type: 'url' | 'domain'): Promise<void> {
  setFilterType(index, type);
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Update filter value
 */
function setFilterValue(index: number, value: string): void {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].value = value;
  persistDraftState();
}

async function updateFilterValue(index: number, value: string): Promise<void> {
  setFilterValue(index, value);
  // Debounce saves to avoid re-render during typing
  scheduleSave();
}

/**
 * Delete filter
 */
async function deleteFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  const selectedFilterIndex = getSelectedFilter(activeProfileId);
  activeProfile.filters.splice(index, 1);
  if (selectedFilterIndex === index) {
    clearSelection(activeProfileId);
  } else if (selectedFilterIndex !== null && selectedFilterIndex > index) {
    selectFilterIndex(activeProfileId, selectedFilterIndex - 1);
  }
  await persistPopupState({ refresh: true, syncExtension: true });
}

function formatNoobCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function updateNoobModeLabel(): void {
  const remainingMs = noobModeUntil - Date.now();
  if (remainingMs <= 0) {
    clearNoobMode().catch((error) => {
      console.warn('Failed to clear noob mode', error);
    });
    return;
  }

  const baseLabel = getMessage('noobModeActivated') || 'Noob mode unlocked';
  document.body.dataset.noobModeLabel = `${baseLabel} · ${formatNoobCountdown(remainingMs)}`;
}

function startNoobModeCountdown(until: number): void {
  noobModeUntil = until;
  document.body.classList.add('noob-mode');
  updateNoobModeLabel();

  if (noobModeCountdownTimer !== null) {
    clearInterval(noobModeCountdownTimer);
  }

  noobModeCountdownTimer = window.setInterval(() => {
    updateNoobModeLabel();
  }, 1000);
}

async function clearNoobMode(persist = true): Promise<void> {
  noobModeUntil = 0;
  document.body.classList.remove('noob-mode');
  delete document.body.dataset.noobModeLabel;

  if (noobModeCountdownTimer !== null) {
    clearInterval(noobModeCountdownTimer);
    noobModeCountdownTimer = null;
  }

  if (persist) {
    await browserAPI.storage.local.remove(NOOB_MODE_UNTIL_KEY);
  }
}

async function initializeNoobMode(): Promise<void> {
  const data = await browserAPI.storage.local.get(NOOB_MODE_UNTIL_KEY);
  const until = Number(data[NOOB_MODE_UNTIL_KEY] || 0);

  if (until > Date.now()) {
    startNoobModeCountdown(until);
    return;
  }

  await clearNoobMode(false);
}

/**
 * Toggle debug section
 */
function toggleDebug(): void {
  const content = document.getElementById('debug-content') as HTMLElement;
  const btn = document.getElementById('toggle-debug-btn') as HTMLButtonElement | null;

  if (!content || !btn) return;

  if (content.style.display === 'none') {
    content.style.display = 'block';
    btn.setAttribute('aria-expanded', 'true');
    replaceWithIcon(btn, 'chevron-up', 'ui-icon ui-icon--sm');
  } else {
    content.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    replaceWithIcon(btn, 'chevron-down', 'ui-icon ui-icon--sm');
  }
}

/**
 * Update debug info
 */
async function updateDebugInfo(): Promise<void> {
  const activeProfile = getActiveProfile();
  const activeHeaders = activeProfile?.headers?.filter((h) => h.enabled).length || 0;
  let activeRuleCount = activeHeaders;
  let dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  let syncStatus = '-';
  let storageSnapshot: any = null;

  let debugState = await getBackgroundDebugState();

  if (
    debugState?.success &&
    globalEnabled &&
    activeHeaders > 0 &&
    Array.isArray(debugState.dynamicRules) &&
    debugState.dynamicRules.length === 0
  ) {
    await browserAPI.runtime.sendMessage({
      action: 'updateRules',
      state: {
        profiles,
        activeProfileId,
        globalEnabled,
      },
    });
    debugState = await getBackgroundDebugState();
  }

  if (debugState?.success) {
    dynamicRules = Array.isArray(debugState.dynamicRules) ? debugState.dynamicRules : [];
    activeRuleCount = dynamicRules.length;
    syncStatus = `${debugState.lastComputedRuleCount}/${debugState.lastAppliedRuleCount}`;
    storageSnapshot = debugState.storageSnapshot || null;
    if (debugState.lastError) {
      syncStatus = `ERR: ${debugState.lastError}`;
    }
    if (storageSnapshot && !debugState.lastError) {
      syncStatus += ` | storage:${storageSnapshot.profileCount}/${storageSnapshot.profilesToApplyCount}/${storageSnapshot.globalEnabled ? 'on' : 'off'}`;
    }
  }

  const rulesCountEl = document.getElementById('debug-rules-count');
  if (rulesCountEl) {
    rulesCountEl.textContent = activeRuleCount.toString();
  }

  const globalEnabledEl = document.getElementById('debug-global-enabled');
  if (globalEnabledEl) {
    globalEnabledEl.textContent = globalEnabled ? 'Yes' : 'No';
  }

  const activeProfileEl = document.getElementById('debug-active-profile');
  if (activeProfileEl) {
    activeProfileEl.textContent = activeProfile?.name || '-';
  }

  const bytesUsed = await browserAPI.storage.local.getBytesInUse();
  const storageSizeEl = document.getElementById('debug-storage-size');
  if (storageSizeEl) {
    storageSizeEl.textContent = `${(bytesUsed / 1024).toFixed(2)} KB`;
  }

  const syncEl = document.getElementById('debug-rule-sync');
  if (syncEl) {
    syncEl.textContent = syncStatus;
  }

  const previewEl = document.getElementById('debug-rules-preview');
  if (previewEl) {
    if (dynamicRules.length === 0) {
      const debugLines = ['No dynamic rules yet.'];
      if (storageSnapshot) {
        debugLines.push(`Storage profiles: ${storageSnapshot.profileCount}`);
        debugLines.push(`Storage profiles to apply: ${storageSnapshot.profilesToApplyCount}`);
        debugLines.push(`Storage global enabled: ${storageSnapshot.globalEnabled ? 'Yes' : 'No'}`);
        debugLines.push(`Storage active profile: ${storageSnapshot.activeProfileName || '-'}`);
        debugLines.push(
          `Storage active headers: ${storageSnapshot.activeProfileHeaderCount} (${storageSnapshot.activeProfileEnabledHeaderCount} enabled)`
        );
        debugLines.push(
          `Storage active filters: ${storageSnapshot.activeProfileFilterCount} (${storageSnapshot.activeProfileEnabledFilterCount} enabled)`
        );
        for (const [index, header] of (storageSnapshot.activeProfileHeaders || []).entries()) {
          debugLines.push(
            `Header ${index + 1}: ${header.enabled ? 'on' : 'off'} ${header.type} ${header.name || '<empty>'} = ${header.value || '<empty>'}`
          );
        }
        for (const [index, filter] of (storageSnapshot.activeProfileFilters || []).entries()) {
          debugLines.push(
            `Filter ${index + 1}: ${filter.enabled ? 'on' : 'off'} ${filter.type} ${filter.value || '<empty>'}`
          );
        }
      }
      previewEl.textContent = debugLines.join('\n');
    } else {
      previewEl.textContent = dynamicRules
        .slice(0, 8)
        .map((rule) => {
          const requestHeader = rule.action.requestHeaders?.[0];
          const responseHeader = rule.action.responseHeaders?.[0];
          const header = requestHeader ?? responseHeader;
          const direction = requestHeader ? 'REQ' : 'RES';
          const operation = header?.operation === 'remove' ? 'remove' : header?.value || 'set';
          return `${rule.id}. ${direction} ${header?.header || 'unknown'} = ${operation} :: ${rule.condition.urlFilter}`;
        })
        .join('\n');
    }
  }
}

/**
 * Clear all data
 */
async function clearAllData(): Promise<void> {
  const confirmed = await showConfirm(getMessage('clearAllData'), getMessage('confirmClearAll'));
  if (!confirmed) return;

  await browserAPI.storage.local.clear();
  await loadState();
  clearSelection();
  await refreshPopupUi();
  showToast(getMessage('dataCleared') || 'All data cleared', 'success');
}

/**
 * Easter egg - Noob mode
 */
async function triggerEasterEgg(): Promise<void> {
  easterEggClickCount += 1;

  if (easterEggResetTimer !== null) {
    clearTimeout(easterEggResetTimer);
  }

  easterEggResetTimer = window.setTimeout(() => {
    easterEggClickCount = 0;
    easterEggResetTimer = null;
  }, EASTER_EGG_RESET_DELAY_MS);

  if (easterEggClickCount >= EASTER_EGG_TRIGGER_COUNT) {
    easterEggClickCount = 0;

    if (easterEggResetTimer !== null) {
      clearTimeout(easterEggResetTimer);
      easterEggResetTimer = null;
    }

    document.body.classList.remove('noob-mode');
    void document.body.offsetWidth;
    const until = Date.now() + EASTER_EGG_DURATION_MS;
    await browserAPI.storage.local.set({ [NOOB_MODE_UNTIL_KEY]: until });
    startNoobModeCountdown(until);
    showToast(getMessage('noobModeActivated') || 'Noob mode unlocked', 'success');
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  await initializeNoobMode();
  setupEventListeners();
  await refreshPopupUi();

  // React to external storage changes (e.g., auto-switch from background)
  browserAPI.storage.onChanged.addListener(async (changes, area) => {
    // Ignore changes that we caused ourselves to prevent re-render during typing
    if (isUpdatingStorage) {
      return;
    }

    if (
      area === 'local' &&
      (changes[STORAGE_KEYS.PROFILES] ||
        changes[STORAGE_KEYS.ACTIVE_PROFILE] ||
        changes[STORAGE_KEYS.GLOBAL_ENABLED])
    ) {
      if (matchesCurrentState(changes)) {
        return;
      }

      await loadState();
      await refreshPopupUi();
    }

    if (area === 'local' && changes[NOOB_MODE_UNTIL_KEY]) {
      const until = Number(changes[NOOB_MODE_UNTIL_KEY].newValue || 0);
      if (until > Date.now()) {
        startNoobModeCountdown(until);
      } else {
        await clearNoobMode(false);
      }
    }
  });
});
