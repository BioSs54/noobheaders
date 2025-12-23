/**
 * NoobHeaders - Popup UI Logic
 */

import { isValidDomain } from './auto-switch.js';
import {
  clearSelection,
  getSelectedFilter,
  selectFilter as selectFilterIndex,
} from './filter-selection.js';
import { detectFilterType } from './filter-utils.js';
import { getMessage } from './i18n.js';
import type { Filter, Header, Profile } from './types/index.js';
import { STORAGE_KEYS } from './types/index.js';

let profiles: Profile[] = [];
let activeProfileId: string | null = null;
let globalEnabled = false;

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
  const data = await chrome.storage.local.get([
    STORAGE_KEYS.PROFILES,
    STORAGE_KEYS.ACTIVE_PROFILE,
    STORAGE_KEYS.GLOBAL_ENABLED,
  ]);

  profiles = data[STORAGE_KEYS.PROFILES] || [];
  activeProfileId = data[STORAGE_KEYS.ACTIVE_PROFILE];
  globalEnabled = data[STORAGE_KEYS.GLOBAL_ENABLED] || false;

  // Create default profile if none exist
  if (profiles.length === 0) {
    const defaultProfile: Profile = {
      id: generateId(),
      name: 'Default Profile',
      headers: [],
      filters: [],
    };
    profiles = [defaultProfile];
    activeProfileId = defaultProfile.id;
    await saveState();
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
    if (
      typeof chrome === 'undefined' ||
      !chrome.storage ||
      !chrome.storage.local ||
      !chrome.storage.local.set
    ) {
      throw new Error('chrome.storage.local.set is not available');
    }
    await chrome.storage.local.set({
      [STORAGE_KEYS.PROFILES]: profiles,
      [STORAGE_KEYS.ACTIVE_PROFILE]: activeProfileId,
      [STORAGE_KEYS.GLOBAL_ENABLED]: globalEnabled,
    });
  } catch (err) {
    console.error('saveState failed:', err);
    throw new Error(`saveState failed: ${(err as Error).message}`);
  }
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

  // Import/Export
  document.getElementById('export-btn')?.addEventListener('click', exportProfiles);
  document.getElementById('import-btn')?.addEventListener('click', () => {
    (document.getElementById('import-input') as HTMLInputElement).click();
  });
  document.getElementById('import-input')?.addEventListener('change', importProfiles);

  // Debug
  document.getElementById('toggle-debug-btn')?.addEventListener('click', toggleDebug);
  document.getElementById('clear-all-btn')?.addEventListener('click', clearAllData);

  // Options
  document.getElementById('options-btn')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Easter egg
  document.getElementById('easter-egg-trigger')?.addEventListener('click', triggerEasterEgg);
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
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.gap = '8px';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '12px';

    // Clickable name selects the profile (accessible)
    const nameBtn = document.createElement('button');
    nameBtn.className = 'btn-link profile-name-btn';
    nameBtn.type = 'button';
    nameBtn.textContent = profile.name;
    nameBtn.title = chrome.i18n.getMessage('activeProfile') || 'Active Profile';
    nameBtn.addEventListener('click', async () => {
      activeProfileId = profile.id;
      await saveState();
      renderProfiles();
      renderHeaders();
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
      await saveState();
      chrome.runtime.sendMessage({ action: 'updateRules' });
      chrome.runtime.sendMessage({ action: 'updateBadge' });
      renderProfiles();
      renderHeaders();
    });

    const toggleSlider = document.createElement('span');
    toggleSlider.className = 'toggle-slider';

    toggleLabel.appendChild(toggleInput);
    toggleLabel.appendChild(toggleSlider);

    // No textual "active" marker — active profile is highlighted visually
    left.appendChild(toggleLabel);
    left.appendChild(nameBtn);

    // Visual active state on the row
    if (profile.id === activeProfileId) {
      row.classList.add('active');
    } else {
      row.classList.remove('active');
    }

    row.appendChild(left);

    // actions on the right
    const actions = document.createElement('div');
    actions.className = 'button-group';
    const renameBtn = document.createElement('button');
    renameBtn.className = 'btn-secondary';
    renameBtn.textContent = chrome.i18n.getMessage('rename');
    renameBtn.addEventListener('click', () => {
      activeProfileId = profile.id;
      renameProfile();
    });

    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn-secondary';
    dupBtn.textContent = chrome.i18n.getMessage('duplicate');
    dupBtn.addEventListener('click', () => {
      activeProfileId = profile.id;
      duplicateProfile();
    });

    actions.appendChild(renameBtn);
    actions.appendChild(dupBtn);
    row.appendChild(actions);

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
  const active = getActiveProfile();
  if (container) {
    container.style.display = active ? 'flex' : 'none';
  }
  if (nameEl) {
    nameEl.textContent = active ? active.name : '';
  }
}

/**
 * Render selected filter editor
 */
function renderFilterEditor(): void {
  const editor = document.getElementById('filter-editor') as HTMLElement | null;
  const activeProfile = getActiveProfile();
  if (!editor || !activeProfile) return;

  const sel = getSelectedFilter();
  if (sel === null || sel < 0 || sel >= (activeProfile.filters?.length || 0)) {
    editor.style.display = 'none';
    return;
  }

  const filter = activeProfile.filters[sel];
  // Populate editor fields
  const typeEl = document.getElementById('editor-filter-type') as HTMLSelectElement;
  const valueEl = document.getElementById('editor-filter-value') as HTMLInputElement;
  const saveBtn = document.getElementById('editor-save-btn') as HTMLButtonElement;
  const deleteBtn = document.getElementById('editor-delete-btn') as HTMLButtonElement;
  const cancelBtn = document.getElementById('editor-cancel-btn') as HTMLButtonElement;

  // Prepare type select
  typeEl.innerHTML = '';
  const urlOpt = document.createElement('option');
  urlOpt.value = 'url';
  urlOpt.textContent = chrome.i18n.getMessage('urlPattern');
  const domOpt = document.createElement('option');
  domOpt.value = 'domain';
  domOpt.textContent = chrome.i18n.getMessage('domain');
  typeEl.appendChild(urlOpt);
  typeEl.appendChild(domOpt);
  typeEl.value = filter.type;

  valueEl.value = filter.value || '';

  // Wire actions
  saveBtn.onclick = async () => {
    updateFilterType(sel, typeEl.value as 'url' | 'domain');
    updateFilterValue(sel, valueEl.value);
    // ensure UI updates
    await saveState();
    renderFilters();
    editor.style.display = 'none';
  };

  deleteBtn.onclick = async () => {
    await deleteFilter(sel);
    clearSelection();
    editor.style.display = 'none';
  };

  cancelBtn.onclick = () => {
    clearSelection();
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
  requestOption.textContent = chrome.i18n.getMessage('request');
  requestOption.selected = header.type === 'request';

  const responseOption = document.createElement('option');
  responseOption.value = 'response';
  responseOption.textContent = chrome.i18n.getMessage('response');
  responseOption.selected = header.type === 'response';

  typeSelect.appendChild(requestOption);
  typeSelect.appendChild(responseOption);

  // Name input
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.className = 'header-name';
  nameInput.placeholder = chrome.i18n.getMessage('headerName');
  nameInput.value = header.name || '';
  // mark for focus preservation
  nameInput.setAttribute('data-index', index.toString());
  nameInput.setAttribute('data-field', 'name');
  nameInput.addEventListener('input', (e) =>
    updateHeaderName(index, (e.target as HTMLInputElement).value)
  );

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'header-value';
  valueInput.placeholder = chrome.i18n.getMessage('headerValue');
  valueInput.value = header.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) =>
    updateHeaderValue(index, (e.target as HTMLInputElement).value)
  );

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete-btn';
  deleteBtn.textContent = '🗑️';
  deleteBtn.title = chrome.i18n.getMessage('delete');
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
    if (getSelectedFilter() === index) filterEl.classList.add('selected');
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
      selectFilterIndex(index);
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
  urlOption.textContent = chrome.i18n.getMessage('urlPattern');
  urlOption.selected = filter.type === 'url';

  const domainOption = document.createElement('option');
  domainOption.value = 'domain';
  domainOption.textContent = chrome.i18n.getMessage('domain');
  domainOption.selected = filter.type === 'domain';

  typeSelect.appendChild(urlOption);
  typeSelect.appendChild(domainOption);

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'filter-value';
  valueInput.placeholder = chrome.i18n.getMessage('filterValuePlaceholder');
  valueInput.value = filter.value || '';
  // mark for focus preservation
  valueInput.setAttribute('data-index', index.toString());
  valueInput.setAttribute('data-field', 'value');
  valueInput.addEventListener('input', (e) => {
    const v = (e.target as HTMLInputElement).value;
    updateFilterValue(index, v);

    // Detect type automatically and update stored type
    const detected = detectFilterType(v);
    if (detected !== filter.type) {
      updateFilterType(index, detected);
      // reflect in select value (kept hidden)
      typeSelect.value = detected;
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

  // Edit button (opens editor panel)
  const editBtn = document.createElement('button');
  editBtn.className = 'icon-btn';
  editBtn.textContent = '✏️';
  editBtn.title = chrome.i18n.getMessage('edit') || 'Edit';
  editBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectFilterIndex(index);
    renderFilters();
    renderFilterEditor();
  });

  // Error span for invalid domain
  const errorSpan = document.createElement('span');
  errorSpan.className = 'field-error';
  errorSpan.style.display = 'none';
  errorSpan.textContent = chrome.i18n.getMessage('invalidDomain');

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete-btn';
  deleteBtn.textContent = '🗑️';
  deleteBtn.title = chrome.i18n.getMessage('delete');
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
  if (!filter.type || filter.type !== initialDetected) {
    // set stored type to detected initially (no override)
    updateFilterType(index, initialDetected);
    typeSelect.value = initialDetected;
  }

  const initialValid =
    (filter.type || initialDetected) !== 'domain' ? true : isValidDomain(filter.value || '');
  if (!initialValid) {
    div.classList.add('invalid');
    toggleInput.disabled = true;
    errorSpan.style.display = 'block';
  }

  return div;
}

/**
 * Handle profile change
 */
async function handleProfileChange(e: Event): Promise<void> {
  activeProfileId = (e.target as HTMLSelectElement).value;
  await saveState();
  renderProfiles();
  renderHeaders();
  renderFilters();
}

/**
 * Add new profile
 */
async function addProfile(): Promise<void> {
  const name = prompt(getMessage('enterProfileName'));
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
  const { autoEnable } = (await chrome.storage.local.get('autoEnable')) as { autoEnable?: boolean };
  if (autoEnable) {
    newProfile.enabled = true;
  }

  await saveState();
  renderProfiles();
  renderHeaders();
  renderFilters();
}

/**
 * Delete profile
 */
async function deleteProfile(): Promise<void> {
  if (profiles.length <= 1) {
    alert(getMessage('cannotDeleteLastProfile'));
    return;
  }

  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  if (!confirm(getMessage('confirmDeleteProfile', activeProfile.name))) return;

  profiles = profiles.filter((p) => p.id !== activeProfileId);
  activeProfileId = profiles[0].id;
  await saveState();
  renderProfiles();
  renderHeaders();
  renderFilters();
}

/**
 * Rename profile
 */
async function renameProfile(): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  const newName = prompt(getMessage('enterNewName'), activeProfile.name);
  if (!newName) return;

  activeProfile.name = newName.trim();
  await saveState();
  renderProfiles();
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
  await saveState();
  renderProfiles();
  renderHeaders();
  renderFilters();
}

/**
 * Toggle global enabled state
 */
async function toggleGlobalEnabled(e: Event): Promise<void> {
  globalEnabled = (e.target as HTMLInputElement).checked;
  await saveState();
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

  await saveState();
  renderHeaders();
}

/**
 * Toggle header
 */
async function toggleHeader(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].enabled = !activeProfile.headers[index].enabled;
  await saveState();
  // notify background and update badge
  chrome.runtime.sendMessage({ action: 'updateRules' });
  chrome.runtime.sendMessage({ action: 'updateBadge' });
  renderHeaders();
}

/**
 * Update header type
 */
async function updateHeaderType(index: number, type: 'request' | 'response'): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].type = type;
  await saveState();
}

/**
 * Update header name
 */
let saveTimeout: number | null = null;

function scheduleSave(delay = 300): void {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  saveTimeout = window.setTimeout(async () => {
    saveTimeout = null;
    await saveState();
    // Notify background and update badge after saving
    chrome.runtime.sendMessage({ action: 'updateRules' });
    chrome.runtime.sendMessage({ action: 'updateBadge' });
  }, delay);
}

async function updateHeaderName(index: number, name: string): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].name = name;
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
  scheduleSave();
}

/**
 * Delete header
 */
async function deleteHeader(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;
  activeProfile.headers.splice(index, 1);
  await saveState();
  renderHeaders();
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
      await saveState();
    } catch (err) {
      console.error('addFilter: saveState failed', err);
      // Inform the user with the underlying error message for easier debugging
      alert(
        `${getMessage('errorAddingFilter') || 'Failed to add filter'}: ${(err as Error).message}`
      );
      // Still render UI to reflect in-memory change
      renderFilters();
      return;
    }

    renderFilters();
  } catch (err) {
    console.error('Failed to add filter', err);
    alert(getMessage('errorAddingFilter') || 'Failed to add filter');
  }
}

/**
 * Toggle filter
 */
async function toggleFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].enabled = !activeProfile.filters[index].enabled;
  await saveState();
  // ensure background rules and badge update and UI reflects changes
  chrome.runtime.sendMessage({ action: 'updateRules' });
  chrome.runtime.sendMessage({ action: 'updateBadge' });
  renderFilters();
  renderFilterEditor();
}

/**
 * Update filter type
 */
async function updateFilterType(index: number, type: 'url' | 'domain'): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].type = type;
  await saveState();
  renderFilters();
}

/**
 * Update filter value
 */
async function updateFilterValue(index: number, value: string): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].value = value;
  // Debounce saves to avoid re-render during typing
  scheduleSave();
}

/**
 * Delete filter
 */
async function deleteFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;
  activeProfile.filters.splice(index, 1);
  await saveState();
  renderFilters();
}

/**
 * Export profiles
 */
function exportProfiles(): void {
  const dataStr = JSON.stringify(profiles, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `noobheaders-profiles-${Date.now()}.json`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Import profiles
 */
async function importProfiles(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const importedProfiles: Profile[] = JSON.parse(text);

    if (!Array.isArray(importedProfiles)) {
      alert(getMessage('invalidProfileFormat'));
      return;
    }

    if (confirm(getMessage('confirmImport', String(importedProfiles.length)))) {
      profiles = importedProfiles;
      activeProfileId = profiles[0]?.id || generateId();
      await saveState();
      renderProfiles();
      renderHeaders();
      renderFilters();
    }
  } catch (error) {
    alert(getMessage('errorImportingProfiles', (error as Error).message));
  }

  input.value = '';
}

/**
 * Toggle debug section
 */
function toggleDebug(): void {
  const content = document.getElementById('debug-content') as HTMLElement;
  const btn = document.getElementById('toggle-debug-btn');

  if (!content || !btn) return;

  if (content.style.display === 'none') {
    content.style.display = 'block';
    btn.textContent = '🔼';
  } else {
    content.style.display = 'none';
    btn.textContent = '🔽';
  }
}

/**
 * Update debug info
 */
async function updateDebugInfo(): Promise<void> {
  const activeProfile = getActiveProfile();
  const activeHeaders = activeProfile?.headers?.filter((h) => h.enabled).length || 0;

  const rulesCountEl = document.getElementById('debug-rules-count');
  if (rulesCountEl) {
    rulesCountEl.textContent = activeHeaders.toString();
  }

  const bytesUsed = await chrome.storage.local.getBytesInUse();
  const storageSizeEl = document.getElementById('debug-storage-size');
  if (storageSizeEl) {
    storageSizeEl.textContent = `${(bytesUsed / 1024).toFixed(2)} KB`;
  }
}

/**
 * Clear all data
 */
async function clearAllData(): Promise<void> {
  if (!confirm(getMessage('confirmClearAll'))) return;

  await chrome.storage.local.clear();
  await loadState();
  renderProfiles();
  renderHeaders();
  renderFilters();
  await updateDebugInfo();
}

/**
 * Easter egg - Noob mode
 */
let clickCount = 0;
function triggerEasterEgg(): void {
  clickCount++;

  if (clickCount >= 5) {
    document.body.classList.add('noob-mode');
    setTimeout(() => {
      document.body.classList.remove('noob-mode');
      clickCount = 0;
    }, 3000);
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  await loadState();
  setupEventListeners();
  renderProfiles();
  renderHeaders();
  renderFilters();
  await updateDebugInfo();

  // React to external storage changes (e.g., auto-switch from background)
  chrome.storage.onChanged.addListener(async (changes, area) => {
    if (
      area === 'local' &&
      (changes[STORAGE_KEYS.PROFILES] ||
        changes[STORAGE_KEYS.ACTIVE_PROFILE] ||
        changes[STORAGE_KEYS.GLOBAL_ENABLED])
    ) {
      await loadState();
      renderProfiles();
      renderHeaders();
      renderFilters();
      await updateDebugInfo();
    }
  });
});
