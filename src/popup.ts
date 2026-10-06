/**
 * NoobHeaders - Popup UI Logic
 */

import { getBrowserApi } from './browser-compat.js';
import { detectFilterType, looksLikeRegex } from './filter-utils.js';
import { HEADER_SUGGESTION_LIST_IDS, installHeaderSuggestions } from './header-suggestions.js';
import { headerAppliesToUrl } from './header-utils.js';
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
import { createIcon } from './ui-icons.js';

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

/** URL of the active tab, to show which profiles apply to it */
let currentTabUrl: string | undefined;
/** Text of the profile search field (shown when there are many profiles) */
let profileSearch = '';
const PROFILE_SEARCH_THRESHOLD = 6;

type EditorTab = 'headers' | 'filters';
const EDITOR_TAB_KEY = 'noobheaders_popup_editor_tab';
let editorTab: EditorTab = 'headers';

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
    } else if (previousFocus?.id) {
      // The trigger was re-rendered (e.g. the actions of the selected profile)
      document.getElementById(previousFocus.id)?.focus();
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

// `copySuffix` of every locale in _locales
const COPY_SUFFIXES = [
  'Kopie',
  'copia',
  'copie',
  'copy',
  'cópia',
  'копия',
  'コピー',
  '副本',
  '사본',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueProfileName(sourceName: string): string {
  const copyLabel = getMessage('copySuffix');
  // Duplicating "Work (copy)" gives "Work (copy 2)", not "Work (copy) (copy)". Names outlive
  // a UI language change, so the suffix of every supported language is recognized.
  const suffixes = [...new Set([copyLabel, ...COPY_SUFFIXES])].map(escapeRegExp).join('|');
  const baseName = sourceName.replace(new RegExp(`\\s\\((?:${suffixes})(?: \\d+)?\\)$`), '');
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
/** Profiles recently written by this popup, to tell its own storage events from external ones */
const recentProfilesWrites: string[] = [];

function rememberProfilesWrite(written: Profile[]): void {
  // Compared after normalization, like the stored value
  recentProfilesWrites.push(JSON.stringify(normalizeProfiles(written)));
  if (recentProfilesWrites.length > 5) recentProfilesWrites.shift();
}

function isOwnProfilesWrite(change: chrome.storage.StorageChange): boolean {
  return recentProfilesWrites.includes(JSON.stringify(normalizeProfiles(change.newValue)));
}

async function saveState(): Promise<void> {
  try {
    if (!browserAPI.storage?.local?.set) {
      throw new Error('browserAPI.storage.local.set is not available');
    }
    isUpdatingStorage = true;
    rememberProfilesWrite(profiles);
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
  // Same as the debounced save: counts and "applies to this tab" markers follow the edit
  renderProfiles();
}

/** Drop the edit waiting to be saved (replaced by a change made elsewhere) */
function cancelPendingSave(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  clearDraftState();
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
      // Counts and "applies to this tab" markers follow the typed headers and filters
      renderProfiles();
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

  document.getElementById('profile-search')?.addEventListener('input', (event) => {
    profileSearch = (event.target as HTMLInputElement).value;
    renderProfiles();
  });

  // Header and filter controls
  document.getElementById('add-header-btn')?.addEventListener('click', addHeader);
  document.getElementById('empty-add-header-btn')?.addEventListener('click', addHeader);
  document.getElementById('add-filter-btn')?.addEventListener('click', addFilter);
  document.getElementById('empty-add-filter-btn')?.addEventListener('click', addFilter);
  setupEditorTabs();

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

let lastScrolledProfileId: string | null = null;

/**
 * Render profiles list
 */
function renderProfiles(): void {
  const radioGroup = document.getElementById('profiles-radio') as HTMLUListElement;
  if (!radioGroup) return;

  // The actions of the selected profile are re-created: keep the keyboard focus on them
  const focusedId = radioGroup.contains(document.activeElement) ? document.activeElement?.id : '';

  // Search field: only useful with many profiles; reordering is off while searching
  const searchInput = document.getElementById('profile-search') as HTMLInputElement | null;
  const searchEmpty = document.getElementById('profile-search-empty');
  const showSearch = profiles.length > PROFILE_SEARCH_THRESHOLD || profileSearch !== '';
  if (searchInput) {
    searchInput.hidden = !showSearch;
    if (!showSearch) profileSearch = '';
    if (searchInput.value !== profileSearch) searchInput.value = profileSearch;
  }
  const searchQuery = profileSearch.trim().toLowerCase();
  const searching = searchQuery !== '';
  let visibleCount = 0;

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
    meta.textContent = getMessage('profileCounts', [
      String(profile.headers?.length || 0),
      String(profile.filters?.length || 0),
    ]);

    const appliesHere = document.createElement('div');
    appliesHere.className = 'profile-applies';
    appliesHere.textContent = getMessage('appliesToThisTab');
    appliesHere.hidden = !profileAppliesToCurrentTab(profile);

    headline.appendChild(nameBtn);
    copy.appendChild(headline);
    copy.appendChild(meta);
    copy.appendChild(appliesHere);
    main.appendChild(toggleLabel);
    main.appendChild(copy);
    row.appendChild(main);

    if (isSelected) {
      if (!profile.enabled) {
        const hint = document.createElement('p');
        hint.id = 'profile-disabled-hint';
        hint.className = 'profile-row-hint';
        hint.textContent = getMessage('profileDisabledHint');
        copy.appendChild(hint);
      }
      row.appendChild(createSelectedProfileActions(!searching));
    }

    // Pointer shortcut: the whole card selects the profile (the switch only turns it on/off).
    // Keyboard and screen reader users use the name button, the card's accessible control.
    row.addEventListener('click', async (event) => {
      const target = event.target as HTMLElement;
      if (isSelected || target.closest('label, button, input')) return;
      await activateProfile(profile.id);
    });

    if (searching) {
      row.hidden = !profile.name.toLowerCase().includes(searchQuery);
      if (!row.hidden) visibleCount += 1;
    } else {
      setupProfileReorder(row, profile.id);
    }

    radioGroup.appendChild(row);
  });

  if (searchEmpty) searchEmpty.hidden = !searching || visibleCount > 0;

  if (focusedId) document.getElementById(focusedId)?.focus();
  // Keep the selected profile visible in the scrollable list, only when the selection changes
  if (activeProfileId !== lastScrolledProfileId) {
    lastScrolledProfileId = activeProfileId;
    scrollRowIntoList(radioGroup, radioGroup.querySelector<HTMLElement>('.profile-row.active'));
  }

  updateActiveProfileDisplay();
}

/** Scroll only the list (not the popup) so that the row is visible */
function scrollRowIntoList(list: HTMLElement, row: HTMLElement | null): void {
  if (!row) return;
  // The list is the offset parent of its rows (position: relative)
  const top = row.offsetTop;
  const bottom = top + row.offsetHeight;
  if (top < list.scrollTop) {
    list.scrollTop = top;
  } else if (bottom > list.scrollTop + list.clientHeight) {
    list.scrollTop = bottom - list.clientHeight;
  }
}

/**
 * Rename, duplicate and delete act on the selected profile: they are shown in its row
 */
function createSelectedProfileActions(canReorder: boolean): HTMLDivElement {
  const actions = document.createElement('div');
  actions.className = 'profile-row-actions';

  const renameBtn = createIconButton('edit', getMessage('rename'), '', renameProfile);
  renameBtn.id = 'rename-profile-btn';
  const duplicateBtn = createIconButton('copy', getMessage('duplicate'), '', duplicateProfile);
  duplicateBtn.id = 'duplicate-profile-btn';
  const exportBtn = createIconButton(
    'download',
    getMessage('exportProfile'),
    '',
    exportSelectedProfile
  );
  exportBtn.id = 'export-profile-btn';
  const deleteBtn = createIconButton(
    'trash',
    getMessage('deleteProfile'),
    'delete-btn',
    deleteProfile
  );
  deleteBtn.id = 'delete-profile-btn';
  // The last profile cannot be deleted
  deleteBtn.disabled = profiles.length <= 1;

  // Move up / down: visible alternative to drag and drop and Alt + arrow keys. Off while the
  // list is filtered by the search, like the other ways to reorder.
  const index = profiles.findIndex((profile) => profile.id === activeProfileId);
  const moveUpBtn = createIconButton('chevron-up', getMessage('moveUp'), '', () =>
    moveSelectedProfile(-1)
  );
  moveUpBtn.id = 'move-up-profile-btn';
  moveUpBtn.disabled = !canReorder || index <= 0;
  const moveDownBtn = createIconButton('chevron-down', getMessage('moveDown'), '', () =>
    moveSelectedProfile(1)
  );
  moveDownBtn.id = 'move-down-profile-btn';
  moveDownBtn.disabled = !canReorder || index === -1 || index >= profiles.length - 1;

  // Keyboard order: edit actions first, then moves (the grid places the moves on the left)
  actions.append(renameBtn, duplicateBtn, exportBtn, deleteBtn, moveUpBtn, moveDownBtn);
  return actions;
}

async function moveSelectedProfile(step: -1 | 1): Promise<void> {
  if (!activeProfileId) return;
  const index = profiles.findIndex((profile) => profile.id === activeProfileId);
  await moveProfile(activeProfileId, index + step);
  // At the top or bottom the button is now disabled: keep the focus on the other one
  const clicked = document.getElementById(
    step < 0 ? 'move-up-profile-btn' : 'move-down-profile-btn'
  );
  const other = document.getElementById(step < 0 ? 'move-down-profile-btn' : 'move-up-profile-btn');
  if (clicked instanceof HTMLButtonElement && clicked.disabled) other?.focus();
}

function isWebUrl(url: string | undefined): boolean {
  return typeof url === 'string' && /^(https?|wss?):/i.test(url);
}

/** Whether at least one header of the profile is applied to the active tab */
function profileAppliesToCurrentTab(profile: Profile): boolean {
  if (!globalEnabled || !profile.enabled || !isWebUrl(currentTabUrl)) return false;
  return (profile.headers ?? []).some((header) =>
    headerAppliesToUrl(profile, header, currentTabUrl)
  );
}

async function loadCurrentTabUrl(): Promise<void> {
  try {
    const [tab] = await browserAPI.tabs.query({ active: true, currentWindow: true });
    currentTabUrl = tab?.url;
  } catch {
    currentTabUrl = undefined;
  }
}

/** Refresh the "applies to this tab" markers when the active tab or its URL changes */
function watchCurrentTab(): void {
  const refresh = async () => {
    await loadCurrentTabUrl();
    renderProfiles();
  };
  browserAPI.tabs.onActivated.addListener(() => void refresh());
  browserAPI.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.url && tab.active) void refresh();
  });
}

/**
 * Move a profile to another position. The order matters: when several profiles set the
 * same header, the later one wins (the selected profile always wins).
 */
async function moveProfile(profileId: string, toIndex: number): Promise<void> {
  const fromIndex = profiles.findIndex((profile) => profile.id === profileId);
  const target = Math.max(0, Math.min(profiles.length - 1, toIndex));
  if (fromIndex === -1 || fromIndex === target) return;

  await flushPendingSave();
  const [moved] = profiles.splice(fromIndex, 1);
  profiles.splice(target, 0, moved);
  await persistPopupState({ refresh: true });
}

function focusProfileName(profileId: string): void {
  const row = document.querySelector(`.profile-row[data-profile-id="${CSS.escape(profileId)}"]`);
  row?.querySelector<HTMLButtonElement>('.profile-name-btn')?.focus();
}

/**
 * Reorder with the mouse (drag and drop) or the keyboard (Alt + Up / Down)
 */
function setupProfileReorder(row: HTMLLIElement, profileId: string): void {
  row.draggable = true;

  row.addEventListener('keydown', async (event) => {
    if (!event.altKey || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return;
    event.preventDefault();
    const index = profiles.findIndex((profile) => profile.id === profileId);
    await moveProfile(profileId, index + (event.key === 'ArrowUp' ? -1 : 1));
    focusProfileName(profileId);
  });

  row.addEventListener('dragstart', (event) => {
    event.dataTransfer?.setData('text/plain', profileId);
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    row.classList.add('is-dragging');
  });
  row.addEventListener('dragend', () => {
    row.classList.remove('is-dragging');
  });

  const dropPosition = (event: DragEvent): 'before' | 'after' => {
    const box = row.getBoundingClientRect();
    return event.clientY < box.top + box.height / 2 ? 'before' : 'after';
  };
  const clearMarkers = () => row.classList.remove('drop-before', 'drop-after');

  row.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    const position = dropPosition(event);
    row.classList.toggle('drop-before', position === 'before');
    row.classList.toggle('drop-after', position === 'after');
  });
  row.addEventListener('dragleave', clearMarkers);
  row.addEventListener('drop', async (event) => {
    event.preventDefault();
    clearMarkers();
    const draggedId = event.dataTransfer?.getData('text/plain');
    if (!draggedId || draggedId === profileId) return;

    const fromIndex = profiles.findIndex((profile) => profile.id === draggedId);
    let toIndex = profiles.findIndex((profile) => profile.id === profileId);
    if (dropPosition(event) === 'after') toIndex += 1;
    // Removing the dragged profile first shifts the positions after it
    if (fromIndex < toIndex) toIndex -= 1;
    await moveProfile(draggedId, toIndex);
  });
}

/**
 * Export the selected profile. The popup cannot reliably download files (it closes when it
 * loses the focus): the options page does it.
 */
async function exportSelectedProfile(): Promise<void> {
  const active = getActiveProfile();
  if (!active) return;
  await flushPendingSave();
  await browserAPI.storage.local.set({
    pendingAction: 'export',
    pendingExportProfileId: active.id,
  });
  browserAPI.runtime.openOptionsPage();
}

function readSavedEditorTab(): EditorTab {
  try {
    return window.localStorage.getItem(EDITOR_TAB_KEY) === 'filters' ? 'filters' : 'headers';
  } catch {
    return 'headers';
  }
}

/**
 * Show the headers or the filters of the selected profile (ARIA tabs)
 */
function showEditorTab(tab: EditorTab, focusTab = false): void {
  editorTab = tab;
  const parts: Array<[EditorTab, string, string, string]> = [
    ['headers', 'tab-headers', 'panel-headers', 'add-header-btn'],
    ['filters', 'tab-filters', 'panel-filters', 'add-filter-btn'],
  ];
  for (const [name, tabId, panelId, addId] of parts) {
    const selected = name === tab;
    const tabEl = document.getElementById(tabId);
    tabEl?.setAttribute('aria-selected', String(selected));
    tabEl?.setAttribute('tabindex', selected ? '0' : '-1');
    if (selected && focusTab) tabEl?.focus();
    const panel = document.getElementById(panelId);
    if (panel) panel.hidden = !selected;
    const addBtn = document.getElementById(addId);
    if (addBtn) addBtn.hidden = !selected;
  }
  try {
    window.localStorage.setItem(EDITOR_TAB_KEY, tab);
  } catch {
    // localStorage can be unavailable: the tab is then not remembered
  }
}

function setupEditorTabs(): void {
  document.getElementById('tab-headers')?.addEventListener('click', () => showEditorTab('headers'));
  document.getElementById('tab-filters')?.addEventListener('click', () => showEditorTab('filters'));
  document.querySelector('.editor-tabs')?.addEventListener('keydown', (event) => {
    const key = (event as KeyboardEvent).key;
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
    event.preventDefault();
    const next: EditorTab =
      key === 'Home'
        ? 'headers'
        : key === 'End'
          ? 'filters'
          : editorTab === 'headers'
            ? 'filters'
            : 'headers';
    showEditorTab(next, true);
  });
  showEditorTab(readSavedEditorTab());
}

/**
 * Show the name of the selected profile in the headings of the sections it edits
 */
function updateActiveProfileDisplay(): void {
  const name = getActiveProfile()?.name ?? '';
  for (const el of document.querySelectorAll('#active-profile-name, [data-active-profile-name]')) {
    el.textContent = name;
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

function setText(id: string, text: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

/**
 * Render headers list
 */
function renderHeaders(): void {
  const container = document.getElementById('headers-list');
  const emptyState = document.getElementById('empty-headers') as HTMLElement;
  const activeProfile = getActiveProfile();

  if (!container || !emptyState) return;

  setText('headers-count', String(activeProfile?.headers.length ?? 0));

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
  icon: 'chevron-down' | 'chevron-up' | 'copy' | 'download' | 'edit' | 'trash',
  label: string,
  className: string,
  onClick: () => void
): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-btn icon-btn--row ${className}`.trim();
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
  typeSelect.addEventListener('change', (e) => {
    void updateHeaderType(index, (e.target as HTMLSelectElement).value as 'request' | 'response');
    updateRemovalNote();
  });

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

  // An empty value removes the header: say so instead of relying on the placeholder
  const removalNote = document.createElement('span');
  removalNote.className = 'field-note';
  removalNote.id = `header-note-${index}`;
  const updateRemovalNote = () => {
    const hasName = header.name.trim() !== '';
    let note = '';
    if (hasName && header.value === '') {
      note = getMessage(
        header.type === 'response' ? 'headerRemovedFromResponses' : 'headerRemovedFromRequests'
      );
    } else if (hasName && header.value.trim() === '') {
      // Spaces are not an empty value: the header is sent, with a blank value
      note = getMessage('headerValueBlank');
    }
    removalNote.hidden = note === '';
    removalNote.textContent = note;
    nameInput.setAttribute('list', HEADER_SUGGESTION_LIST_IDS[header.type]);
  };

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
    updateRemovalNote();
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
  valueInput.setAttribute('aria-describedby', `${errorSpan.id} ${removalNote.id}`);
  valueInput.spellcheck = false;
  valueInput.autocomplete = 'off';
  valueInput.value = header.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) => {
    updateHeaderValue(index, (e.target as HTMLInputElement).value);
    setRowError(div, errorSpan, getHeaderError(header));
    updateRemovalNote();
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
  div.appendChild(removalNote);

  setRowError(div, errorSpan, getHeaderError(header));
  updateRemovalNote();

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

  setText('filters-count', String(activeProfile?.filters.length ?? 0));

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

  // Users coming from ModHeader write regular expressions (".*"): say that "*" is the wildcard
  const regexNote = document.createElement('span');
  regexNote.className = 'field-note';
  regexNote.id = `filter-note-${index}`;
  regexNote.textContent = getMessage('filterRegexHint');
  const updateRegexNote = (value: string) => {
    regexNote.hidden = !looksLikeRegex(value);
  };

  // Type badge: detected automatically from the value
  const typeBadge = document.createElement('span');
  typeBadge.className = 'filter-type-badge';

  const renderTypeBadge = () => {
    const current = getActiveProfile()?.filters[index] ?? filter;
    const isDomain = current.type === 'domain';
    typeBadge.textContent = getMessage(isDomain ? 'domain' : 'urlPatternShort');
    typeBadge.title = getMessage(isDomain ? 'domain' : 'urlPattern');
    typeBadge.hidden = !current.value.trim();
  };

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'filter-value';
  valueInput.placeholder = getMessage('filterValuePlaceholder');
  valueInput.setAttribute('aria-label', getMessage('filters'));
  valueInput.setAttribute('aria-describedby', `${errorSpan.id} ${regexNote.id}`);
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
    updateRegexNote(v);
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
  div.appendChild(regexNote);

  renderTypeBadge();
  setRowError(div, errorSpan, getFilterError(filter));
  updateRegexNote(filter.value || '');

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
  // The "applies to this tab" markers depend on the global switch
  renderProfiles();
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
  showEditorTab('headers');

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
  showEditorTab('filters');

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
  installHeaderSuggestions();
  await Promise.all([loadState(), loadCurrentTabUrl()]);
  await initializeNoobMode();
  setupEventListeners();
  watchCurrentTab();
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

    const profilesChange = changes[STORAGE_KEYS.PROFILES];
    const externalProfiles = Boolean(profilesChange) && !isOwnProfilesWrite(profilesChange);

    // Ignore the events of our own writes (they would re-render while typing)
    if (isUpdatingStorage && !externalProfiles) {
      return;
    }

    if (
      profilesChange ||
      changes[STORAGE_KEYS.ACTIVE_PROFILE] ||
      changes[STORAGE_KEYS.GLOBAL_ENABLED]
    ) {
      if (matchesCurrentState(changes)) {
        return;
      }

      if (profilesChange && profilesChange.newValue === undefined) {
        // Storage cleared elsewhere (options "clear all data"): drop the pending edit and wait
        // for the data written right after, instead of recreating a demo profile now
        cancelPendingSave();
        return;
      }

      if (saveTimer !== null) {
        if (externalProfiles) {
          // The profiles were replaced elsewhere (options import): that wins over the edit
          // being typed, which must not write the old profiles back
          cancelPendingSave();
        } else {
          // Only the switch or the selection changed (shortcut, auto-switch): keep the edit
          // being typed, and take the new global switch so the pending save keeps it
          if (changes[STORAGE_KEYS.GLOBAL_ENABLED]) {
            globalEnabled = Boolean(changes[STORAGE_KEYS.GLOBAL_ENABLED].newValue);
            const globalToggle = document.getElementById('global-enabled') as HTMLInputElement;
            if (globalToggle) globalToggle.checked = globalEnabled;
            persistDraftState();
            renderGlobalState();
            renderProfiles();
          }
          return;
        }
      }

      await loadState();
      await refreshPopupUi();
    }
  });
});
