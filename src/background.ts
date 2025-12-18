/**
 * NoobHeaders - Background Service Worker
 * Clean, privacy-focused HTTP header modifier
 */

import type {
  Filter,
  Header,
  HeaderAction,
  ModifyHeaderRule,
  Profile,
  StorageData,
} from './types/index.js';
import { STORAGE_KEYS } from './types/index.js';

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
function convertProfileToRules(
  profile: Profile,
  globalEnabled: boolean,
  ruleIdOffset: number = RULE_ID_OFFSET
): ModifyHeaderRule[] {
  const rules: ModifyHeaderRule[] = [];

  if (!globalEnabled || !profile.headers || profile.headers.length === 0) {
    return rules;
  }

  profile.headers.forEach((header: Header, index: number) => {
    if (!header.enabled || !header.name) {
      return;
    }

    // Add header modification
    const headerObj: HeaderAction = {
      header: header.name,
      operation: header.value ? 'set' : 'remove',
    };

    if (header.value) {
      headerObj.value = header.value;
    }

    // Build action based on header type - ONLY include the array that will be used
    const action: ModifyHeaderRule['action'] = {
      type: 'modifyHeaders',
    };

    if (header.type === 'request') {
      action.requestHeaders = [headerObj];
    } else {
      action.responseHeaders = [headerObj];
    }

    // Apply filters if they exist
    const hasFilters = profile.filters && profile.filters.length > 0;
    const activeFilters: Filter[] = hasFilters
      ? profile.filters.filter((f) => f.enabled && f.value)
      : [];

    const condition: ModifyHeaderRule['condition'] = {
      urlFilter: '*://*/*',
      resourceTypes: [
        'main_frame',
        'sub_frame',
        'stylesheet',
        'script',
        'image',
        'font',
        'object',
        'xmlhttprequest',
        'ping',
        'csp_report',
        'media',
        'websocket',
        'other',
      ],
    };

    if (activeFilters.length > 0) {
      // Use the first URL filter if available
      const urlFilter = activeFilters.find((f) => f.type === 'url');
      if (urlFilter) {
        condition.urlFilter = urlFilter.value;
      }

      // Add domain filters (only initiatorDomains is supported in MV3)
      const domainFilters = activeFilters.filter((f) => f.type === 'domain');
      if (domainFilters.length > 0) {
        condition.initiatorDomains = domainFilters.map((f) => f.value);
      }
    }

    const rule: ModifyHeaderRule = {
      id: ruleIdOffset + index,
      priority: 1,
      action,
      condition,
    };

    rules.push(rule);
  });

  return rules;
}

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

    const activeProfile = profiles.find((p) => p.id === activeProfileId);

    if (!activeProfile) {
      await applyRules([]);
      return;
    }

    const rules = convertProfileToRules(activeProfile, globalEnabled);
    await applyRules(rules);
  } catch (error) {
    // Silent error handling
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

    const activeProfile = profiles.find((p) => p.id === activeProfileId);

    if (!globalEnabled || !activeProfile) {
      await chrome.action.setBadgeText({ text: '' });
      await chrome.action.setBadgeBackgroundColor({ color: '#808080' });
      return;
    }

    // Count active headers
    const activeHeaders = activeProfile.headers.filter((h) => h.enabled).length;

    if (activeHeaders === 0) {
      await chrome.action.setBadgeText({ text: '' });
    } else {
      await chrome.action.setBadgeText({ text: activeHeaders.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
    }
  } catch (error) {
    // Silent error handling
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
