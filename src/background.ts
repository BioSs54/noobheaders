/**
 * NoobHeaders - Background Service Worker
 * Clean, privacy-focused HTTP header modifier
 */

import { convertProfileToRules } from './rules';
import { STORAGE_KEYS } from './types/index.js';
import type {
  Filter,
  Header,
  HeaderAction,
  ModifyHeaderRule,
  Profile,
  StorageData,
} from './types/index.js';

const RULE_ID_OFFSET = 1;

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Convert profile to declarativeNetRequest rules
 */
// convertProfileToRules is implemented in ./rules.ts to keep URL-filter OR semantics

/**
 * Apply rules to declarativeNetRequest
 */
async function applyRules(rules: ModifyHeaderRule[]): Promise<boolean> {
  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const existingRuleIds = existingRules.map((r) => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: existingRuleIds,
      addRules: rules as chrome.declarativeNetRequest.Rule[],
    });

    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Handle update rules request
 */
async function handleUpdateRules(): Promise<void> {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.ACTIVE_PROFILE,
      STORAGE_KEYS.GLOBAL_ENABLED,
    ]);

    const profiles: Profile[] = data[STORAGE_KEYS.PROFILES] || [];
    const activeProfileId: string = data[STORAGE_KEYS.ACTIVE_PROFILE];
    const globalEnabled: boolean = data[STORAGE_KEYS.GLOBAL_ENABLED] || false;

    // If global is disabled, clear rules
    if (!globalEnabled) {
      await applyRules([]);
      return;
    }

    // Merge rules from all enabled profiles. If none explicitly enabled, fall back to active profile.
    // A profile is considered enabled if profile.enabled === true
    const enabledProfiles = profiles.filter((p) => p.enabled === true);
    const profilesToApply =
      enabledProfiles.length > 0
        ? enabledProfiles
        : profiles.filter((p) => p.id === activeProfileId);

    let rules: any[] = [];
    let ruleIdOffset = RULE_ID_OFFSET;
    for (const p of profilesToApply) {
      const prs = convertProfileToRules(p, true, ruleIdOffset);
      rules = rules.concat(prs);
      ruleIdOffset += prs.length;
    }

    await applyRules(rules as any);
  } catch (error) {
    console.error('Error in handleUpdateRules:', error);
  }
}

/**
 * Update extension badge
 */
async function updateBadge(): Promise<void> {
  try {
    const data = await chrome.storage.local.get([
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.ACTIVE_PROFILE,
      STORAGE_KEYS.GLOBAL_ENABLED,
    ]);

    const profiles: Profile[] = data[STORAGE_KEYS.PROFILES] || [];
    const activeProfileId: string = data[STORAGE_KEYS.ACTIVE_PROFILE];
    const globalEnabled: boolean = data[STORAGE_KEYS.GLOBAL_ENABLED] || false;

    if (!globalEnabled) {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setBadgeBackgroundColor({ color: '#808080' });
      return;
    }

    // Determine profiles that contribute: enabled profiles if any, otherwise the active profile
    // A profile is considered enabled if profile.enabled === true
    const enabledProfiles = profiles.filter((p) => p.enabled === true);
    const profilesToCheck =
      enabledProfiles.length > 0
        ? enabledProfiles
        : profiles.filter((p) => p.id === activeProfileId);

    // Get active tab URL to compute which headers actually apply
    let url: string | undefined;
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) url = tabs[0].url;
    } catch (e) {
      // ignore
    }

    // Count headers that are enabled and whose filters match the active URL
    const { countApplicableHeadersForUrl } = await import('./header-utils.js');
    const applicableCount = countApplicableHeadersForUrl(profilesToCheck, url);

    if (applicableCount === 0) {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await chrome.action.setBadgeText({ text: applicableCount.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
    }
  } catch (error) {
    console.error('Error in updateBadge:', error);
  }
}

// Initialize extension
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open welcome page on first install
    await chrome.tabs.create({ url: 'welcome.html' });

    // Initialize default profile
    const defaultProfile: Profile = {
      id: generateId(),
      name: 'Default Profile',
      headers: [],
      filters: [],
    };

    await chrome.storage.local.set({
      [STORAGE_KEYS.PROFILES]: [defaultProfile],
      [STORAGE_KEYS.ACTIVE_PROFILE]: defaultProfile.id,
      [STORAGE_KEYS.GLOBAL_ENABLED]: false,
    });
  }

  // Update badge on install/update
  await updateBadge();
});

// Listen to storage changes to update rules
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  if (
    namespace === 'local' &&
    (changes[STORAGE_KEYS.PROFILES] ||
      changes[STORAGE_KEYS.ACTIVE_PROFILE] ||
      changes[STORAGE_KEYS.GLOBAL_ENABLED])
  ) {
    await handleUpdateRules();
    await updateBadge();
  }
});

// Auto-switch profiles based on active tab URL
import { selectProfileForUrl } from './auto-switch.js';

async function tryAutoSwitch(tabId: number) {
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab.url) return;

    const data = await chrome.storage.local.get([
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.ACTIVE_PROFILE,
    ]);
    const profiles: Profile[] = data[STORAGE_KEYS.PROFILES] || [];
    const activeProfileId: string = data[STORAGE_KEYS.ACTIVE_PROFILE];

    const matched = selectProfileForUrl(profiles, tab.url);
    if (matched && matched.id !== activeProfileId) {
      await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE]: matched.id });
      // handleUpdateRules will be triggered via storage.onChanged
    }
  } catch (e) {
    // ignore
  }
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    tryAutoSwitch(tabId);
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  tryAutoSwitch(activeInfo.tabId);
});

// Handle messages from popup/options
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'updateRules') {
    handleUpdateRules().then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'updateBadge') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true;
  }
});

// Initialize on startup
handleUpdateRules();
updateBadge();
