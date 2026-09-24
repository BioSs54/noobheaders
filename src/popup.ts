/**
 * NoobHeaders - Popup UI Logic
 */

import { getBrowserApi } from './browser-compat.js';
import { detectFilterType } from './filter-utils.js';
import { getMessage } from './i18n.js';
import {
  isActiveFilter,
  isValidFilter,
  isValidHeaderName,
  isValidHeaderValue,
} from './matching.js';
import type { Filter, Header, Profile } from './types/index.js';
import {
  createDefaultProfile,
  generateProfileId,
  normalizeProfiles,
  STORAGE_KEYS,
} from './types/index.js';
import { createIcon, replaceWithIcon } from './ui-icons.js';

const browserAPI = getBrowserApi();
const EASTER_EGG_TRIGGER_COUNT = 3;
const EASTER_EGG_RESET_DELAY_MS = 1200;
const EASTER_EGG_DURATION_MS = 300000;
const NOOB_MODE_UNTIL_KEY = 'noobheaders_noob_mode_until';
const POPUP_DRAFT_STATE_KEY = 'noobheaders_popup_draft_state';
const SAVE_DEBOUNCE_MS = 400;
const TOAST_DURATION_MS = 3000;
const UNDO_TOAST_DURATION_MS = 6000;

let profiles: Profile[] = [];
let activeProfileId: string | null = null;
let globalEnabled = false;

// Debounce timer for storage writes + extension sync after text input updates
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

    const draftProfiles = normalizeProfiles(parsedDraft.profiles);
    if (draftProfiles.length === 0) {
      return null;
    }

    return {
      profiles: draftProfiles,
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

interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * Show toast notification, optionally with an action button (e.g. "Undo")
 */
function showToast(
  message: string,
  type: 'success' | 'error' | 'warning' = 'success',
  action?: ToastAction
): void {
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

  let dismissed = false;
  const dismiss = () => {
    if (dismissed) return;
    dismissed = true;
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 300);
  };

  if (action) {
    const actionBtn = document.createElement('button');
    actionBtn.type = 'button';
    actionBtn.className = 'toast-action';
    actionBtn.textContent = action.label;
    actionBtn.addEventListener('click', () => {
      dismiss();
      action.onClick();
    });
    toast.appendChild(actionBtn);
  }

  container.appendChild(toast);

  setTimeout(dismiss, action ? UNDO_TOAST_DURATION_MS : TOAST_DURATION_MS);
}

interface ModalOptions {
  modal: HTMLElement;
  confirmButton: HTMLElement;
  cancelButton: HTMLElement;
  initialFocus: HTMLElement;
  /** Return false to keep the modal open (e.g. validation error) */
  onConfirm: () => boolean;
  onCancel: () => void;
}

let cancelActiveModal: (() => void) | null = null;

/**
 * Open a modal dialog: handles Escape/Enter, overlay click, focus trap and focus restore.
 * All listeners are removed when the modal closes.
 */
function openModal(options: ModalOptions): void {
  const { modal, confirmButton, cancelButton, initialFocus, onConfirm, onCancel } = options;

  // Only one modal at a time
  cancelActiveModal?.();

  const previousFocus = document.activeElement as HTMLElement | null;

  const getFocusable = () =>
    Array.from(modal.querySelectorAll<HTMLElement>('button, input')).filter(
      (el) => !el.hasAttribute('disabled') && el.offsetParent !== null
    );

  const close = () => {
    modal.style.display = 'none';
    confirmButton.removeEventListener('click', handleConfirm);
    cancelButton.removeEventListener('click', handleCancel);
    modal.removeEventListener('keydown', handleKeydown);
    modal.removeEventListener('click', handleOverlayClick);
    cancelActiveModal = null;
    if (previousFocus && document.contains(previousFocus)) {
      previousFocus.focus();
    }
  };

  const handleConfirm = () => {
    if (onConfirm()) {
      close();
    }
  };

  const handleCancel = () => {
    close();
    onCancel();
  };

  const handleOverlayClick = (e: MouseEvent) => {
    if (e.target === modal) {
      handleCancel();
    }
  };

  const handleKeydown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    } else if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT') {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === 'Tab') {
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  confirmButton.addEventListener('click', handleConfirm);
  cancelButton.addEventListener('click', handleCancel);
  modal.addEventListener('keydown', handleKeydown);
  modal.addEventListener('click', handleOverlayClick);
  cancelActiveModal = handleCancel;

  modal.style.display = 'flex';
  initialFocus.focus();
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

    openModal({
      modal,
      confirmButton: okBtn,
      cancelButton: cancelBtn,
      // Destructive action: focus the safe choice by default
      initialFocus: cancelBtn,
      onConfirm: () => {
        resolve(true);
        return true;
      },
      onCancel: () => resolve(false),
    });
  });
}

/**
 * Show prompt modal. `validate` returns an error message to keep the modal open.
 */
function showPrompt(
  title: string,
  message: string,
  defaultValue = '',
  validate?: (value: string) => string | null
): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.getElementById('prompt-modal');
    const titleEl = document.getElementById('prompt-title');
    const messageEl = document.getElementById('prompt-message');
    const input = document.getElementById('prompt-input') as HTMLInputElement | null;
    const errorEl = document.getElementById('prompt-error');
    const okBtn = document.getElementById('prompt-ok');
    const cancelBtn = document.getElementById('prompt-cancel');

    if (!modal || !titleEl || !messageEl || !input || !okBtn || !cancelBtn) {
      resolve(null);
      return;
    }

    const setError = (error: string | null) => {
      if (errorEl) {
        errorEl.textContent = error ?? '';
        errorEl.hidden = !error;
      }
      input.setAttribute('aria-invalid', error ? 'true' : 'false');
    };

    const handleInput = () => setError(null);

    titleEl.textContent = title;
    messageEl.textContent = message;
    input.value = defaultValue;
    setError(null);
    input.addEventListener('input', handleInput);

    openModal({
      modal,
      confirmButton: okBtn,
      cancelButton: cancelBtn,
      initialFocus: input,
      onConfirm: () => {
        const value = input.value.trim();
        const error = value ? (validate?.(value) ?? null) : getMessage('nameRequired');
        if (error) {
          setError(error);
          input.focus();
          return false;
        }
        input.removeEventListener('input', handleInput);
        resolve(value);
        return true;
      },
      onCancel: () => {
        input.removeEventListener('input', handleInput);
        resolve(null);
      },
    });

    input.select();
  });
}

/**
 * Get active profile
 */
function getActiveProfile(): Profile | undefined {
  return profiles.find((p) => p.id === activeProfileId);
}

function validateProfileName(value: string, ignoreId?: string): string | null {
  const exists = profiles.some(
    (profile) => profile.id !== ignoreId && profile.name.toLowerCase() === value.toLowerCase()
  );
  return exists ? getMessage('profileNameExists') : null;
}

function uniqueProfileName(baseName: string): string {
  const copyLabel = getMessage('copySuffix');
  let candidate = `${baseName} (${copyLabel})`;
  let counter = 2;
  while (validateProfileName(candidate)) {
    candidate = `${baseName} (${copyLabel} ${counter})`;
    counter += 1;
  }
  return candidate;
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

  let needsSave = false;

  // Create default profile if none exist
  if (profiles.length === 0) {
    const defaultProfile: Profile = createDefaultProfile(generateProfileId());
    profiles = [defaultProfile];
    activeProfileId = defaultProfile.id;
    needsSave = true;
  }

  const draftState = consumeDraftState();
  if (draftState) {
    profiles = JSON.parse(JSON.stringify(draftState.profiles));
    activeProfileId = draftState.activeProfileId;
    globalEnabled = draftState.globalEnabled;
    needsSave = true;
  }

  // The selected profile must always exist
  if (!getActiveProfile()) {
    activeProfileId = profiles[0].id;
    needsSave = true;
  }

  if (needsSave) {
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
    if (!browserAPI.storage?.local?.set) {
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
  try {
    await browserAPI.runtime.sendMessage({
      action: 'updateRules',
      state: {
        profiles,
        activeProfileId,
        globalEnabled,
      },
    });
    await browserAPI.runtime.sendMessage({ action: 'updateBadge' });
  } catch (error) {
    console.warn('Failed to sync extension state', error);
  }
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
  const { refresh = false, syncExtension = true } = options;

  // Any pending debounced save is superseded by this one
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }

  await saveStateImmediately();

  if (refresh) {
    refreshProfileViews();
  }

  if (syncExtension) {
    await syncExtensionState();
  } else if (refresh) {
    await updateDebugInfo();
  }
}

async function flushPendingSave(): Promise<void> {
  if (saveTimer === null) {
    return;
  }

  clearTimeout(saveTimer);
  saveTimer = null;
  await saveStateImmediately();
  await syncExtensionState();
}

/**
 * Debounce storage writes and rule updates while typing.
 * The draft copy in localStorage protects edits if the popup closes before the timer fires.
 */
function scheduleSave(delay = SAVE_DEBOUNCE_MS): void {
  persistDraftState();

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
  }

  saveTimer = window.setTimeout(async () => {
    saveTimer = null;
    try {
      await saveStateImmediately();
      await syncExtensionState();
    } catch (error) {
      console.error('Debounced save failed', error);
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

function renderVersion(): void {
  const versionEl = document.getElementById('easter-egg-trigger');
  try {
    const version = browserAPI.runtime.getManifest().version;
    if (versionEl && version) {
      versionEl.textContent = `v${version}`;
    }
  } catch {
    // keep the static fallback
  }
}

function renderGlobalState(): void {
  const hint = document.getElementById('global-disabled-hint');
  if (hint) {
    hint.hidden = globalEnabled;
  }
  document.body.classList.toggle('is-globally-disabled', !globalEnabled);
}

/**
 * Render profiles list
 */
function renderProfiles(): void {
  const radioGroup = document.getElementById('profiles-radio') as HTMLUListElement;
  if (!radioGroup) return;

  radioGroup.replaceChildren();

  profiles.forEach((profile) => {
    const isSelected = profile.id === activeProfileId;
    const row = document.createElement('li');
    row.className = 'profile-row';
    row.dataset.profileId = profile.id;
    row.classList.toggle('active', isSelected);
    row.classList.toggle('is-off', !profile.enabled);

    const main = document.createElement('div');
    main.className = 'profile-row-main';

    const copy = document.createElement('div');
    copy.className = 'profile-row-copy';

    const headline = document.createElement('div');
    headline.className = 'profile-row-headline';

    // Clickable name selects the profile for editing
    const nameBtn = document.createElement('button');
    nameBtn.className = 'btn-link profile-name-btn';
    nameBtn.type = 'button';
    nameBtn.textContent = profile.name;
    nameBtn.title = getMessage('selectProfile');
    if (isSelected) {
      nameBtn.setAttribute('aria-current', 'true');
    }
    nameBtn.addEventListener('click', async () => {
      await activateProfile(profile.id);
    });

    // Toggle: whether the profile's headers are applied (does not change the selection)
    const toggleLabel = document.createElement('label');
    toggleLabel.className = 'toggle-container mini';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.className = 'toggle-input';
    toggleInput.checked = !!profile.enabled;
    toggleInput.setAttribute('aria-label', getMessage('enableProfileLabel', profile.name));
    toggleInput.addEventListener('change', async (e) => {
      await setProfileEnabled(profile.id, (e.target as HTMLInputElement).checked);
    });

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'toggle-slider';

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    const meta = document.createElement('div');
    meta.className = 'profile-row-meta';
    meta.textContent = `${profile.headers?.length || 0} ${getMessage('headers')} • ${profile.filters?.length || 0} ${getMessage('filters')}`;

    if (isSelected) {
      const badge = document.createElement('span');
      badge.className = 'profile-status-badge';
      badge.textContent = getMessage('profileActivePrefix')
        .replace(/\s*:\s*$/, '')
        .trim();
      headline.appendChild(badge);
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
 * Update the summary card that shows the selected profile
 */
function updateActiveProfileDisplay(): void {
  const nameEl = document.getElementById('active-profile-name');
  const container = document.getElementById('active-profile-display');
  const disabledHint = document.getElementById('profile-disabled-hint');
  const renameBtn = document.getElementById('rename-profile-btn') as HTMLButtonElement | null;
  const duplicateBtn = document.getElementById('duplicate-profile-btn') as HTMLButtonElement | null;
  const active = getActiveProfile();
  if (container) {
    container.style.display = active ? 'flex' : 'none';
  }
  if (nameEl) {
    nameEl.textContent = active ? active.name : '';
  }
  if (disabledHint) {
    disabledHint.hidden = !active || active.enabled === true;
  }
  if (renameBtn) {
    renameBtn.disabled = !active;
  }
  if (duplicateBtn) {
    duplicateBtn.disabled = !active;
  }
}

function refreshProfileViews(): void {
  renderGlobalState();
  renderProfiles();
  renderHeaders();
  renderFilters();
}

async function refreshPopupUi(): Promise<void> {
  refreshProfileViews();
  await updateDebugInfo();
}

async function activateProfile(profileId: string, persist = true): Promise<void> {
  await flushPendingSave();
  activeProfileId = profileId;

  if (persist) {
    await persistPopupState({ refresh: true });
    return;
  }

  await refreshPopupUi();
}

async function setProfileEnabled(profileId: string, enabled: boolean): Promise<void> {
  const profile = profiles.find((p) => p.id === profileId);
  if (!profile) return;
  profile.enabled = enabled;
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Preserve focus/selection of inputs inside a list across re-renders
 */
function captureFocus(container: HTMLElement) {
  const active = document.activeElement as HTMLInputElement | null;
  if (!active || !container.contains(active)) return null;
  const focusedIndex = active.getAttribute('data-index');
  const focusedField = active.getAttribute('data-field');
  if (!focusedIndex || !focusedField) return null;
  return {
    focusedIndex,
    focusedField,
    selStart: active.selectionStart ?? null,
    selEnd: active.selectionEnd ?? null,
  };
}

function restoreFocus(container: HTMLElement, state: ReturnType<typeof captureFocus>): void {
  if (!state) return;
  const selector = `[data-index="${state.focusedIndex}"][data-field="${state.focusedField}"]`;
  const el = container.querySelector(selector) as HTMLInputElement | null;
  if (!el) return;
  el.focus();
  if (state.selStart !== null && state.selEnd !== null) {
    try {
      el.setSelectionRange(state.selStart, state.selEnd);
    } catch (_e) {
      // ignore if unavailable (e.g. select elements)
    }
  }
}

/**
 * Render headers list
 */
function renderHeaders(): void {
  const container = document.getElementById('headers-list');
  const emptyState = document.getElementById('empty-headers') as HTMLElement;
  const activeProfile = getActiveProfile();

  if (!container || !emptyState) return;

  // Preserve focus/selection in header inputs across re-renders
  const focusState = captureFocus(container);

  container.replaceChildren();

  if (!activeProfile?.headers || activeProfile.headers.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  activeProfile.headers.forEach((header, index) => {
    const headerEl = createHeaderElement(header, index);
    container.appendChild(headerEl);
  });

  restoreFocus(container, focusState);
}

function createRowToggle(checked: boolean, label: string, onChange: () => void) {
  const toggleLabel = document.createElement('label');
  toggleLabel.className = 'toggle-container mini';

  const toggleInput = document.createElement('input');
  toggleInput.type = 'checkbox';
  toggleInput.className = 'toggle-input';
  toggleInput.checked = checked;
  toggleInput.setAttribute('aria-label', label);
  toggleInput.addEventListener('change', onChange);

  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);
  return { toggleLabel, toggleInput };
}

function createIconButton(
  icon: 'copy' | 'trash',
  label: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-btn ${className}`;
  button.title = label;
  button.setAttribute('aria-label', label);
  button.appendChild(createIcon(icon, 'ui-icon ui-icon--sm'));
  button.addEventListener('click', onClick);
  return button;
}

function getHeaderError(header: Header): string | null {
  if (header.name.trim() !== '' && !isValidHeaderName(header.name)) {
    return getMessage('invalidHeaderName');
  }
  if (!isValidHeaderValue(header.value)) {
    return getMessage('invalidHeaderValue');
  }
  return null;
}

function setRowError(row: HTMLElement, errorEl: HTMLElement, error: string | null): void {
  row.classList.toggle('invalid', Boolean(error));
  errorEl.textContent = error ?? '';
  errorEl.hidden = !error;
}

/**
 * Create header element
 */
function createHeaderElement(header: Header, index: number): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'header-item';
  div.classList.toggle('is-off', !header.enabled);

  const { toggleLabel } = createRowToggle(header.enabled, getMessage('enableHeader'), () =>
    toggleHeader(index)
  );

  // Type select
  const typeSelect = document.createElement('select');
  typeSelect.className = 'header-type';
  typeSelect.setAttribute('aria-label', getMessage('headerTypeLabel'));
  typeSelect.setAttribute('data-index', index.toString());
  typeSelect.setAttribute('data-field', 'type');
  typeSelect.addEventListener('change', (e) =>
    updateHeaderType(index, (e.target as HTMLSelectElement).value as 'request' | 'response')
  );

  const requestOption = document.createElement('option');
  requestOption.value = 'request';
  requestOption.textContent = getMessage('request');
  requestOption.selected = header.type === 'request';

  const responseOption = document.createElement('option');
  responseOption.value = 'response';
  responseOption.textContent = getMessage('response');
  responseOption.selected = header.type === 'response';

  typeSelect.appendChild(requestOption);
  typeSelect.appendChild(responseOption);

  const errorSpan = document.createElement('span');
  errorSpan.className = 'field-error';
  errorSpan.id = `header-error-${index}`;
  errorSpan.hidden = true;

  // Name input
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'header-name';
  nameInput.placeholder = getMessage('headerName');
  nameInput.setAttribute('aria-label', getMessage('headerName'));
  nameInput.setAttribute('aria-describedby', errorSpan.id);
  nameInput.spellcheck = false;
  nameInput.autocomplete = 'off';
  nameInput.value = header.name || '';
  // mark for focus preservation
  nameInput.setAttribute('data-index', index.toString());
  nameInput.setAttribute('data-field', 'name');
  nameInput.addEventListener('input', (e) => {
    updateHeaderName(index, (e.target as HTMLInputElement).value);
    setRowError(div, errorSpan, getHeaderError(header));
  });
  nameInput.addEventListener('blur', () => {
    void flushPendingSave();
  });

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'header-value';
  valueInput.placeholder = getMessage('headerValue');
  valueInput.setAttribute('aria-label', getMessage('headerValue'));
  valueInput.setAttribute('aria-describedby', errorSpan.id);
  valueInput.spellcheck = false;
  valueInput.autocomplete = 'off';
  valueInput.value = header.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) => {
    updateHeaderValue(index, (e.target as HTMLInputElement).value);
    setRowError(div, errorSpan, getHeaderError(header));
  });
  valueInput.addEventListener('blur', () => {
    void flushPendingSave();
  });

  const duplicateBtn = createIconButton(
    'copy',
    getMessage('duplicateHeader'),
    'duplicate-btn',
    () => duplicateHeader(index)
  );
  const deleteBtn = createIconButton('trash', getMessage('delete'), 'delete-btn', () =>
    deleteHeader(index)
  );

  div.appendChild(toggleLabel);
  div.appendChild(typeSelect);
  div.appendChild(nameInput);
  div.appendChild(valueInput);
  div.appendChild(duplicateBtn);
  div.appendChild(deleteBtn);
  div.appendChild(errorSpan);

  setRowError(div, errorSpan, getHeaderError(header));

  return div;
}

/**
 * Render filters list
 */
function renderFilters(): void {
  const container = document.getElementById('filters-list');
  const emptyState = document.getElementById('empty-filters') as HTMLElement;
  const help = document.getElementById('filter-help');
  const activeProfile = getActiveProfile();

  if (!container || !emptyState) return;

  const focusState = captureFocus(container);

  container.replaceChildren();

  const hasFilters = Boolean(activeProfile?.filters && activeProfile.filters.length > 0);
  emptyState.style.display = hasFilters ? 'none' : 'block';
  if (help) help.hidden = !hasFilters;

  if (!activeProfile || !hasFilters) {
    return;
  }

  activeProfile.filters.forEach((filter, index) => {
    container.appendChild(createFilterElement(filter, index));
  });

  restoreFocus(container, focusState);
}

function getFilterError(filter: Filter): string | null {
  if (!isActiveFilter({ ...filter, enabled: true })) return null;
  return isValidFilter(filter) ? null : getMessage('invalidDomain');
}

/**
 * Create filter element
 */
function createFilterElement(filter: Filter, index: number): HTMLDivElement {
  const div = document.createElement('div');
  div.className = 'filter-item';
  div.classList.toggle('is-off', !filter.enabled);

  // Invalid filters can still be switched off: they are never applied anyway
  const { toggleLabel } = createRowToggle(filter.enabled, getMessage('enableFilter'), () =>
    toggleFilter(index)
  );

  const errorSpan = document.createElement('span');
  errorSpan.className = 'field-error';
  errorSpan.id = `filter-error-${index}`;
  errorSpan.hidden = true;

  // Type badge: detected automatically from the value
  const typeBadge = document.createElement('span');
  typeBadge.className = 'filter-type-badge';

  const renderTypeBadge = () => {
    const current = getActiveProfile()?.filters[index] ?? filter;
    typeBadge.textContent =
      current.type === 'domain' ? getMessage('domain') : getMessage('urlPattern');
    typeBadge.hidden = !current.value.trim();
  };

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'filter-value';
  valueInput.placeholder = getMessage('filterValuePlaceholder');
  valueInput.setAttribute('aria-label', getMessage('filters'));
  valueInput.setAttribute('aria-describedby', errorSpan.id);
  valueInput.spellcheck = false;
  valueInput.autocomplete = 'off';
  valueInput.value = filter.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    setFilterValue(index, v);
    // Detect type automatically and update stored type
    setFilterType(index, detectFilterType(v));
    scheduleSave();

    const current = getActiveProfile()?.filters[index];
    if (current) setRowError(div, errorSpan, getFilterError(current));
    renderTypeBadge();
  });
  valueInput.addEventListener('blur', () => {
    void flushPendingSave();
  });

  const duplicateBtn = createIconButton(
    'copy',
    getMessage('duplicateFilter'),
    'duplicate-btn',
    () => duplicateFilter(index)
  );
  const deleteBtn = createIconButton('trash', getMessage('delete'), 'delete-btn', () =>
    deleteFilter(index)
  );

  div.appendChild(toggleLabel);
  div.appendChild(valueInput);
  div.appendChild(typeBadge);
  div.appendChild(duplicateBtn);
  div.appendChild(deleteBtn);
  div.appendChild(errorSpan);

  renderTypeBadge();
  setRowError(div, errorSpan, getFilterError(filter));

  return div;
}

/**
 * Add new profile
 */
async function addProfile(): Promise<void> {
  const name = await showPrompt(getMessage('addProfile'), getMessage('enterProfileName'), '', (v) =>
    validateProfileName(v)
  );
  if (!name) return;

  await flushPendingSave();

  const newProfile: Profile = {
    id: generateProfileId(),
    name,
    enabled: false,
    headers: [],
    filters: [],
  };

  // If user opted to auto-enable profiles, switch the new profile on
  const { autoEnable } = (await browserAPI.storage.local.get('autoEnable')) as {
    autoEnable?: boolean;
  };
  if (autoEnable) {
    newProfile.enabled = true;
  }

  profiles.push(newProfile);
  activeProfileId = newProfile.id;

  await persistPopupState({ refresh: true });
  showToast(getMessage('profileAdded'), 'success');
}

/**
 * Delete the selected profile
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

  await flushPendingSave();
  profiles = profiles.filter((p) => p.id !== activeProfile.id);
  activeProfileId = profiles[0].id;
  await persistPopupState({ refresh: true });
  showToast(getMessage('profileDeleted'), 'success');
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
    activeProfile.name,
    (v) => validateProfileName(v, activeProfile.id)
  );
  if (!newName || newName === activeProfile.name) return;

  activeProfile.name = newName;
  await persistPopupState({ refresh: true, syncExtension: false });
  showToast(getMessage('profileRenamed'), 'success');
}

/**
 * Duplicate profile
 */
async function duplicateProfile(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  await flushPendingSave();

  const newProfile: Profile = {
    ...JSON.parse(JSON.stringify(activeProfile)),
    id: generateProfileId(),
    name: uniqueProfileName(activeProfile.name),
  };

  // Insert the copy right after the original
  const index = profiles.findIndex((p) => p.id === activeProfile.id);
  profiles.splice(index + 1, 0, newProfile);
  activeProfileId = newProfile.id;
  await persistPopupState({ refresh: true });
  showToast(getMessage('profileDuplicated'), 'success');
}

/**
 * Toggle global enabled state
 */
async function toggleGlobalEnabled(e: Event): Promise<void> {
  globalEnabled = (e.target as HTMLInputElement).checked;
  renderGlobalState();
  await persistPopupState({ syncExtension: true });
}

function focusRowInput(listId: string, index: number, field: string): void {
  const el = document.querySelector<HTMLInputElement>(
    `#${listId} [data-index="${index}"][data-field="${field}"]`
  );
  el?.focus();
}

/**
 * Add header
 */
async function addHeader(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  activeProfile.headers.push({
    enabled: true,
    type: 'request',
    name: '',
    value: '',
  });

  await persistPopupState({ refresh: true, syncExtension: false });
  focusRowInput('headers-list', activeProfile.headers.length - 1, 'name');
}

async function duplicateHeader(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.headers[index]) return;
  activeProfile.headers.splice(index + 1, 0, { ...activeProfile.headers[index] });
  await persistPopupState({ refresh: true });
  focusRowInput('headers-list', index + 1, 'name');
}

/**
 * Toggle header
 */
async function toggleHeader(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.headers[index]) return;
  activeProfile.headers[index].enabled = !activeProfile.headers[index].enabled;
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Update header type
 */
async function updateHeaderType(index: number, type: 'request' | 'response'): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.headers[index]) return;
  activeProfile.headers[index].type = type;
  await persistPopupState({ syncExtension: true });
}

/**
 * Update header name
 */
function updateHeaderName(index: number, name: string): void {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.headers[index]) return;
  activeProfile.headers[index].name = name;
  // Debounce writes to avoid re-rendering on every keystroke
  scheduleSave();
}

/**
 * Update header value
 */
function updateHeaderValue(index: number, value: string): void {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.headers[index]) return;
  activeProfile.headers[index].value = value;
  scheduleSave();
}

/**
 * Delete an item from the selected profile, with an "Undo" toast
 */
async function deleteWithUndo<T>(
  list: 'headers' | 'filters',
  index: number,
  message: string
): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.[list][index]) return;

  const profileId = activeProfile.id;
  const [removed] = (activeProfile[list] as T[]).splice(index, 1);
  await persistPopupState({ refresh: true, syncExtension: true });

  showToast(message, 'success', {
    label: getMessage('undo'),
    onClick: async () => {
      const profile = profiles.find((p) => p.id === profileId);
      if (!profile) return;
      const items = profile[list] as T[];
      items.splice(Math.min(index, items.length), 0, removed);
      await persistPopupState({ refresh: true, syncExtension: true });
    },
  });
}

async function deleteHeader(index: number): Promise<void> {
  await deleteWithUndo<Header>('headers', index, getMessage('headerDeleted'));
}

/**
 * Add filter
 */
async function addFilter(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) {
    console.warn('No active profile found when adding filter');
    return;
  }

  activeProfile.filters.push({
    enabled: true,
    type: 'url',
    value: '',
  });

  try {
    await persistPopupState({ refresh: true, syncExtension: false });
  } catch (err) {
    console.error('addFilter: saveState failed', err);
    showToast(`${getMessage('errorAddingFilter')}: ${(err as Error).message}`, 'error');
    // Still render UI to reflect in-memory change
    refreshProfileViews();
    return;
  }

  focusRowInput('filters-list', activeProfile.filters.length - 1, 'value');
}

async function duplicateFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.filters[index]) return;
  activeProfile.filters.splice(index + 1, 0, { ...activeProfile.filters[index] });
  await persistPopupState({ refresh: true });
  focusRowInput('filters-list', index + 1, 'value');
}

/**
 * Toggle filter
 */
async function toggleFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.filters[index]) return;
  activeProfile.filters[index].enabled = !activeProfile.filters[index].enabled;
  await persistPopupState({ refresh: true, syncExtension: true });
}

/**
 * Update filter type
 */
function setFilterType(index: number, type: 'url' | 'domain'): void {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.filters[index]) return;
  activeProfile.filters[index].type = type;
}

/**
 * Update filter value
 */
function setFilterValue(index: number, value: string): void {
  const activeProfile = getActiveProfile();
  if (!activeProfile?.filters[index]) return;
  activeProfile.filters[index].value = value;
}

/**
 * Delete filter
 */
async function deleteFilter(index: number): Promise<void> {
  await deleteWithUndo<Filter>('filters', index, getMessage('filterDeleted'));
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

  const baseLabel = getMessage('noobModeActivated');
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

function isDebugOpen(): boolean {
  const content = document.getElementById('debug-content');
  return Boolean(content && content.style.display !== 'none');
}

/**
 * Toggle debug section
 */
async function toggleDebug(): Promise<void> {
  const content = document.getElementById('debug-content') as HTMLElement;
  const btn = document.getElementById('toggle-debug-btn') as HTMLButtonElement | null;

  if (!content || !btn) return;

  if (content.style.display === 'none') {
    content.style.display = 'block';
    btn.setAttribute('aria-expanded', 'true');
    replaceWithIcon(btn, 'chevron-up', 'ui-icon ui-icon--sm');
    await updateDebugInfo();
  } else {
    content.style.display = 'none';
    btn.setAttribute('aria-expanded', 'false');
    replaceWithIcon(btn, 'chevron-down', 'ui-icon ui-icon--sm');
  }
}

/**
 * Update debug info (read-only: never changes the extension state).
 * Skipped while the debug panel is collapsed.
 */
async function updateDebugInfo(): Promise<void> {
  if (!isDebugOpen()) return;

  const activeProfile = getActiveProfile();
  let activeRuleCount = 0;
  let dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  let syncStatus = '-';
  let storageSnapshot: any = null;

  const debugState = await getBackgroundDebugState();

  if (debugState?.success) {
    dynamicRules = Array.isArray(debugState.dynamicRules) ? debugState.dynamicRules : [];
    activeRuleCount = Number(debugState.activeRuleCount ?? dynamicRules.length) || 0;
    syncStatus = `${debugState.lastComputedRuleCount}/${debugState.lastAppliedRuleCount}`;
    storageSnapshot = debugState.storageSnapshot || null;
    if (debugState.lastError) {
      syncStatus = `ERR: ${debugState.lastError}`;
    }
    if (storageSnapshot && !debugState.lastError) {
      syncStatus += ` | storage:${storageSnapshot.profileCount}/${storageSnapshot.profilesToApplyCount}/${storageSnapshot.globalEnabled ? 'on' : 'off'}`;
    }
  }

  const yes = getMessage('yes');
  const no = getMessage('no');

  const rulesCountEl = document.getElementById('debug-rules-count');
  if (rulesCountEl) {
    rulesCountEl.textContent = activeRuleCount.toString();
  }

  const globalEnabledEl = document.getElementById('debug-global-enabled');
  if (globalEnabledEl) {
    globalEnabledEl.textContent = globalEnabled ? yes : no;
  }

  const activeProfileEl = document.getElementById('debug-active-profile');
  if (activeProfileEl) {
    activeProfileEl.textContent = activeProfile?.name || '-';
  }

  const storageSizeEl = document.getElementById('debug-storage-size');
  if (storageSizeEl) {
    try {
      const bytesUsed = await browserAPI.storage.local.getBytesInUse();
      storageSizeEl.textContent = `${(bytesUsed / 1024).toFixed(2)} KB`;
    } catch {
      // getBytesInUse is not implemented in every Firefox version
      storageSizeEl.textContent = '-';
    }
  }

  const syncEl = document.getElementById('debug-rule-sync');
  if (syncEl) {
    syncEl.textContent = syncStatus;
  }

  const previewEl = document.getElementById('debug-rules-preview');
  if (previewEl) {
    if (dynamicRules.length === 0) {
      const debugLines = [getMessage('debugNoRules')];
      if (storageSnapshot) {
        debugLines.push(`Storage profiles: ${storageSnapshot.profileCount}`);
        debugLines.push(`Storage profiles to apply: ${storageSnapshot.profilesToApplyCount}`);
        debugLines.push(`Storage global enabled: ${storageSnapshot.globalEnabled ? yes : no}`);
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
          const condition =
            rule.condition.regexFilter ??
            rule.condition.requestDomains?.join(', ') ??
            rule.condition.urlFilter;
          return `${rule.id}. ${direction} ${header?.header || 'unknown'} = ${operation} :: ${condition}`;
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

  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  clearDraftState();
  // Our own reload below handles the change: ignore the storage events it triggers
  isUpdatingStorage = true;
  await browserAPI.storage.local.clear();
  await loadState();
  await clearNoobMode(false);
  await refreshPopupUi();
  showToast(getMessage('dataCleared'), 'success');
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
    showToast(getMessage('noobModeActivated'), 'success');
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  renderVersion();
  await loadState();
  await initializeNoobMode();
  setupEventListeners();
  await refreshPopupUi();
  document.body.dataset.ready = 'true';

  // React to external storage changes (e.g., auto-switch from background, options import)
  browserAPI.storage.onChanged.addListener(async (changes, area) => {
    if (area !== 'local') return;

    if (changes[NOOB_MODE_UNTIL_KEY]) {
      const until = Number(changes[NOOB_MODE_UNTIL_KEY].newValue || 0);
      if (until > Date.now()) {
        startNoobModeCountdown(until);
      } else {
        await clearNoobMode(false);
      }
    }

    // Ignore changes that we caused ourselves to prevent re-render during typing
    if (isUpdatingStorage) {
      return;
    }

    if (
      changes[STORAGE_KEYS.PROFILES] ||
      changes[STORAGE_KEYS.ACTIVE_PROFILE] ||
      changes[STORAGE_KEYS.GLOBAL_ENABLED]
    ) {
      if (matchesCurrentState(changes)) {
        return;
      }

      // Don't clobber an edit that is still being typed
      if (saveTimer !== null) {
        return;
      }

      await loadState();
      await refreshPopupUi();
    }
  });
});
