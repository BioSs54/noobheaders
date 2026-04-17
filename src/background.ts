/**
 * NoobHeaders - Background Service Worker
 * Simple, local-first HTTP header modifier
 */

import {
  detectBrowser,
  getActionApi,
  getBrowserApi,
  supportsDeclarativeNetRequest,
} from './browser-compat.js';
import { applyHeadersWebRequest } from './firefox-webrequest.js';
import { convertProfileToRules, resolveProfilesToApply } from './rules.js';
import { STORAGE_KEYS, createDefaultProfile, normalizeProfiles } from './types/index.js';
import type {
  Filter,
  Header,
  HeaderAction,
  ModifyHeaderRule,
  Profile,
  StorageData,
} from './types/index.js';

const IS_FIREFOX = detectBrowser() === 'firefox';
const USE_DECLARATIVE_NET_REQUEST = supportsDeclarativeNetRequest();

// Get the appropriate browser API
const browserAPI = getBrowserApi();

// Log browser detection
console.log('[NoobHeaders] Browser detected:', IS_FIREFOX ? 'Firefox' : 'Chrome/Chromium');
console.log('[NoobHeaders] Using declarativeNetRequest:', USE_DECLARATIVE_NET_REQUEST);

const RULE_ID_OFFSET = 1;

const debugState = {
  lastAppliedRuleCount: 0,
  lastComputedRuleCount: 0,
  lastError: '',
};

interface ExtensionStateSnapshot {
  profiles: Profile[];
  activeProfileId: string | null;
  globalEnabled: boolean;
}

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

    debugState.lastAppliedRuleCount = rules.length;
    debugState.lastError = '';

    return true;
  } catch (error) {
    debugState.lastAppliedRuleCount = 0;
    debugState.lastError = error instanceof Error ? error.message : String(error);
    return false;
  }
}

/**
 * Handle update rules request
 */
async function handleUpdateRules(snapshot?: ExtensionStateSnapshot): Promise<void> {
  try {
    console.log('[NoobHeaders] handleUpdateRules called');
    const browserAPI = IS_FIREFOX ? browser : chrome;
    const data = snapshot
      ? {
          [STORAGE_KEYS.PROFILES]: snapshot.profiles,
          [STORAGE_KEYS.ACTIVE_PROFILE]: snapshot.activeProfileId,
          [STORAGE_KEYS.GLOBAL_ENABLED]: snapshot.globalEnabled,
        }
      : await browserAPI.storage.local.get([
          STORAGE_KEYS.PROFILES,
          STORAGE_KEYS.ACTIVE_PROFILE,
          STORAGE_KEYS.GLOBAL_ENABLED,
        ]);

    const profiles: Profile[] = normalizeProfiles(data[STORAGE_KEYS.PROFILES]);
    const activeProfileId: string = data[STORAGE_KEYS.ACTIVE_PROFILE];
    const globalEnabled: boolean = data[STORAGE_KEYS.GLOBAL_ENABLED] || false;

    console.log('[NoobHeaders] Storage data:', {
      profileCount: profiles.length,
      activeProfileId,
      globalEnabled,
      profiles: profiles.map((p) => ({
        id: p.id,
        name: p.name,
        enabled: p.enabled,
        headerCount: p.headers?.length,
      })),
    });

    // Always include the selected profile and let it override any additionally enabled profiles.
    const profilesToApply = resolveProfilesToApply(profiles, activeProfileId);

    console.log(
      '[NoobHeaders] Profiles to apply:',
      profilesToApply.length,
      profilesToApply.map((p) => p.name)
    );

    // Use appropriate API based on browser
    if (IS_FIREFOX || !USE_DECLARATIVE_NET_REQUEST) {
      console.log('[NoobHeaders] Using Firefox webRequest API');
      // Firefox: Use webRequest API (Manifest V2)
      applyHeadersWebRequest(profilesToApply, globalEnabled);
    } else {
      console.log('[NoobHeaders] Using Chrome declarativeNetRequest API');
      // Chrome: Use declarativeNetRequest API (Manifest V3)
      if (!globalEnabled) {
        debugState.lastComputedRuleCount = 0;
        await applyRules([]);
        return;
      }

      let rules: any[] = [];
      let ruleIdOffset = RULE_ID_OFFSET;
      for (const [index, profile] of profilesToApply.entries()) {
        const prs = convertProfileToRules(profile, true, ruleIdOffset, index + 1);
        rules = rules.concat(prs);
        ruleIdOffset += prs.length;
      }

      debugState.lastComputedRuleCount = rules.length;

      await applyRules(rules as any);
    }
  } catch (error) {
    debugState.lastError = error instanceof Error ? error.message : String(error);
    console.error('Error in handleUpdateRules:', error);
  }
}

/**
 * Update extension badge
 */
async function updateBadge(): Promise<void> {
  try {
    const data = await browserAPI.storage.local.get([
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.ACTIVE_PROFILE,
      STORAGE_KEYS.GLOBAL_ENABLED,
      'showBadge',
    ]);

    const profiles: Profile[] = normalizeProfiles(data[STORAGE_KEYS.PROFILES]);
    const activeProfileId: string = data[STORAGE_KEYS.ACTIVE_PROFILE];
    const globalEnabled: boolean = data[STORAGE_KEYS.GLOBAL_ENABLED] || false;
    const showBadge: boolean = data.showBadge !== false;
    const actionAPI = getActionApi();

    if (!actionAPI || !showBadge) {
      await actionAPI?.setBadgeText({ text: '' });
      return;
    }

    if (!globalEnabled) {
      await actionAPI.setBadgeText({ text: '' });
      await actionAPI.setBadgeBackgroundColor({ color: '#808080' });
      return;
    }

    const profilesToCheck = resolveProfilesToApply(profiles, activeProfileId);

    // Get active tab URL to compute which headers actually apply
    let url: string | undefined;
    try {
      const tabs = await browserAPI.tabs.query({ active: true, currentWindow: true });
      if (tabs && tabs.length > 0) url = tabs[0].url;
    } catch (e) {
      // ignore
    }

    // Count headers that are enabled and whose filters match the active URL
    const { countApplicableHeadersForUrl } = await import('./header-utils.js');
    const applicableCount = countApplicableHeadersForUrl(profilesToCheck, url);

    if (applicableCount === 0) {
      await actionAPI.setBadgeText({ text: '' });
    } else {
      await actionAPI.setBadgeText({ text: applicableCount.toString() });
      await actionAPI.setBadgeBackgroundColor({ color: '#667eea' });
    }
  } catch (error) {
    console.error('Error in updateBadge:', error);
  }
}

// Initialize extension
browserAPI.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Open welcome page on first install
    await browserAPI.tabs.create({ url: 'welcome.html' });

    // Initialize default profile
    const defaultProfile: Profile = createDefaultProfile(generateId());

    await browserAPI.storage.local.set({
      [STORAGE_KEYS.PROFILES]: [defaultProfile],
      [STORAGE_KEYS.ACTIVE_PROFILE]: defaultProfile.id,
      [STORAGE_KEYS.GLOBAL_ENABLED]: false,
    });
  }

  // Update badge on install/update
  await updateBadge();
});

// Listen to storage changes to update rules
browserAPI.storage.onChanged.addListener(async (changes, namespace) => {
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
    const tab = await browserAPI.tabs.get(tabId);
    if (!tab || !tab.url) return;

    const data = await browserAPI.storage.local.get([
      STORAGE_KEYS.PROFILES,
      STORAGE_KEYS.ACTIVE_PROFILE,
    ]);
    const profiles: Profile[] = data[STORAGE_KEYS.PROFILES] || [];
    const activeProfileId: string = data[STORAGE_KEYS.ACTIVE_PROFILE];

    const matched = selectProfileForUrl(profiles, tab.url);
    if (matched && matched.id !== activeProfileId) {
      await browserAPI.storage.local.set({ [STORAGE_KEYS.ACTIVE_PROFILE]: matched.id });
      // handleUpdateRules will be triggered via storage.onChanged
    }
  } catch (e) {
    // ignore
  }
}

browserAPI.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' || changeInfo.url) {
    tryAutoSwitch(tabId);
  }
});

browserAPI.tabs.onActivated.addListener(async (activeInfo) => {
  tryAutoSwitch(activeInfo.tabId);
});

// Handle messages from popup/options
browserAPI.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === 'updateRules') {
    handleUpdateRules(message.state).then(() => sendResponse({ success: true }));
    return true; // Keep channel open for async response
  }

  if (message.action === 'updateBadge') {
    updateBadge().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === 'getDebugState') {
    (async () => {
      try {
        const storageData = await browserAPI.storage.local.get([
          STORAGE_KEYS.PROFILES,
          STORAGE_KEYS.ACTIVE_PROFILE,
          STORAGE_KEYS.GLOBAL_ENABLED,
        ]);
        const storageProfiles: Profile[] = normalizeProfiles(storageData[STORAGE_KEYS.PROFILES]);
        const storageActiveProfileId: string | null =
          storageData[STORAGE_KEYS.ACTIVE_PROFILE] || null;
        const storageGlobalEnabled: boolean = Boolean(storageData[STORAGE_KEYS.GLOBAL_ENABLED]);
        const storageActiveProfile = storageProfiles.find(
          (profile) => profile.id === storageActiveProfileId
        );
        const profilesToApply = resolveProfilesToApply(
          storageProfiles,
          storageActiveProfileId || ''
        );
        const dynamicRules =
          IS_FIREFOX || !USE_DECLARATIVE_NET_REQUEST
            ? []
            : await chrome.declarativeNetRequest.getDynamicRules();

        sendResponse({
          success: true,
          isFirefox: IS_FIREFOX,
          usesDeclarativeNetRequest: USE_DECLARATIVE_NET_REQUEST,
          storageSnapshot: {
            profileCount: storageProfiles.length,
            activeProfileId: storageActiveProfileId,
            activeProfileName: storageActiveProfile?.name || null,
            activeProfileHeaderCount: storageActiveProfile?.headers?.length || 0,
            activeProfileEnabledHeaderCount:
              storageActiveProfile?.headers?.filter((header) => header.enabled).length || 0,
            activeProfileHeaders:
              storageActiveProfile?.headers?.map((header) => ({
                enabled: header.enabled,
                type: header.type,
                name: header.name,
                value: header.value,
              })) || [],
            activeProfileFilterCount: storageActiveProfile?.filters?.length || 0,
            activeProfileEnabledFilterCount:
              storageActiveProfile?.filters?.filter((filter) => filter.enabled).length || 0,
            activeProfileFilters:
              storageActiveProfile?.filters?.map((filter) => ({
                enabled: filter.enabled,
                type: filter.type,
                value: filter.value,
              })) || [],
            globalEnabled: storageGlobalEnabled,
            profilesToApplyCount: profilesToApply.length,
          },
          dynamicRules,
          lastAppliedRuleCount: debugState.lastAppliedRuleCount,
          lastComputedRuleCount: debugState.lastComputedRuleCount,
          lastError: debugState.lastError,
        });
      } catch (error) {
        sendResponse({
          success: false,
          isFirefox: IS_FIREFOX,
          usesDeclarativeNetRequest: USE_DECLARATIVE_NET_REQUEST,
          dynamicRules: [],
          lastAppliedRuleCount: debugState.lastAppliedRuleCount,
          lastComputedRuleCount: debugState.lastComputedRuleCount,
          lastError: error instanceof Error ? error.message : String(error),
        });
      }
    })();
    return true;
  }
});

// Initialize on startup
handleUpdateRules();
updateBadge();
