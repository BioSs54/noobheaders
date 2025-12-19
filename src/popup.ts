/**
 * NoobHeaders - Popup UI Logic
 */

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
  await chrome.storage.local.set({
    [STORAGE_KEYS.PROFILES]: profiles,
    [STORAGE_KEYS.ACTIVE_PROFILE]: activeProfileId,
    [STORAGE_KEYS.GLOBAL_ENABLED]: globalEnabled,
  });
}

/**
 * Setup event listeners
 */
function setupEventListeners(): void {
  // Global toggle
  document.getElementById('global-enabled')?.addEventListener('change', toggleGlobalEnabled);

  // Profile controls
  document.getElementById('profile-select')?.addEventListener('change', handleProfileChange);
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
  const select = document.getElementById('profile-select') as HTMLSelectElement;
  if (!select) return;

  select.innerHTML = '';
  profiles.forEach((profile) => {
    const option = document.createElement('option');
    option.value = profile.id;
    option.textContent = profile.name;
    if (profile.id === activeProfileId) {
      option.selected = true;
    }
    select.appendChild(option);
  });

  // Update delete button state
  const deleteBtn = document.getElementById('delete-profile-btn') as HTMLButtonElement;
  if (deleteBtn) {
    deleteBtn.disabled = profiles.length <= 1;
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

  container.innerHTML = '';

  if (!activeProfile || !activeProfile.headers || activeProfile.headers.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  activeProfile.headers.forEach((header, index) => {
    const headerEl = createHeaderElement(header, index);
    container.appendChild(headerEl);
  });
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
  toggleInput.addEventListener('change', () => toggleHeader(index));

  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';

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
  nameInput.addEventListener('input', (e) =>
    updateHeaderName(index, (e.target as HTMLInputElement).value)
  );

  // Value input
  const valueInput = document.createElement('input');
  valueInput.type = 'text';
  valueInput.className = 'header-value';
  valueInput.placeholder = chrome.i18n.getMessage('headerValue');
  valueInput.value = header.value || '';
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
  const container = document.getElementById('filters-list');
  const emptyState = document.getElementById('empty-filters') as HTMLElement;
  const activeProfile = getActiveProfile();

  if (!container || !emptyState) return;

  container.innerHTML = '';

  if (!activeProfile || !activeProfile.filters || activeProfile.filters.length === 0) {
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';

  activeProfile.filters.forEach((filter, index) => {
    const filterEl = createFilterElement(filter, index);
    container.appendChild(filterEl);
  });
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
  toggleInput.addEventListener('change', () => toggleFilter(index));

  const toggleSlider = document.createElement('span');
  toggleSlider.className = 'toggle-slider';

  toggleLabel.appendChild(toggleInput);
  toggleLabel.appendChild(toggleSlider);

  // Type select
  const typeSelect = document.createElement('select');
  typeSelect.className = 'filter-type';
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
  valueInput.placeholder = filter.type === 'domain' ? 'example.com' : '*://example.com/*';
  valueInput.value = filter.value || '';
  valueInput.addEventListener('input', (e) =>
    updateFilterValue(index, (e.target as HTMLInputElement).value)
  );

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'icon-btn delete-btn';
  deleteBtn.textContent = '🗑️';
  deleteBtn.title = chrome.i18n.getMessage('delete');
  deleteBtn.addEventListener('click', () => deleteFilter(index));

  div.appendChild(toggleLabel);
  div.appendChild(typeSelect);
  div.appendChild(valueInput);
  div.appendChild(deleteBtn);

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
async function updateHeaderName(index: number, name: string): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].name = name;
  await saveState();
}

/**
 * Update header value
 */
async function updateHeaderValue(index: number, value: string): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.headers[index]) return;
  activeProfile.headers[index].value = value;
  await saveState();
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
  const activeProfile = getActiveProfile();
  if (!activeProfile) return;

  if (!activeProfile.filters) {
    activeProfile.filters = [];
  }

  activeProfile.filters.push({
    enabled: true,
    type: 'url',
    value: '',
  });

  await saveState();
  renderFilters();
}

/**
 * Toggle filter
 */
async function toggleFilter(index: number): Promise<void> {
  const activeProfile = getActiveProfile();
  if (!activeProfile || !activeProfile.filters[index]) return;
  activeProfile.filters[index].enabled = !activeProfile.filters[index].enabled;
  await saveState();
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
  await saveState();
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
});
