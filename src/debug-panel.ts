/**
 * Debug panel of the options page: a read-only view of the rules the background applies.
 */

import { getBrowserApi } from './browser-compat.js';
import { getMessage } from './i18n.js';

const browserAPI = getBrowserApi();

interface StorageSnapshot {
  profileCount: number;
  activeProfileName: string | null;
  activeProfileHeaderCount: number;
  activeProfileEnabledHeaderCount: number;
  activeProfileHeaders: Array<{ enabled: boolean; type: string; name: string; value: string }>;
  activeProfileFilterCount: number;
  activeProfileEnabledFilterCount: number;
  activeProfileFilters: Array<{ enabled: boolean; type: string; value: string }>;
  globalEnabled: boolean;
  profilesToApplyCount: number;
}

interface DebugState {
  success: boolean;
  dynamicRules?: chrome.declarativeNetRequest.Rule[];
  activeRuleCount?: number;
  lastAppliedRuleCount?: number;
  lastComputedRuleCount?: number;
  lastError?: string | null;
  storageSnapshot?: StorageSnapshot;
}

async function getBackgroundDebugState(): Promise<DebugState | null> {
  try {
    return (await browserAPI.runtime.sendMessage({ action: 'getDebugState' })) as DebugState;
  } catch (error) {
    console.warn('Failed to read background debug state', error);
    return null;
  }
}

function setText(id: string, text: string): void {
  const element = document.getElementById(id);
  if (element) element.textContent = text;
}

function describeRule(rule: chrome.declarativeNetRequest.Rule): string {
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
}

function describeSnapshot(snapshot: StorageSnapshot, yes: string, no: string): string[] {
  const lines = [
    `Storage profiles: ${snapshot.profileCount}`,
    `Storage profiles to apply: ${snapshot.profilesToApplyCount}`,
    `Storage global enabled: ${snapshot.globalEnabled ? yes : no}`,
    `Storage active profile: ${snapshot.activeProfileName || '-'}`,
    `Storage active headers: ${snapshot.activeProfileHeaderCount} (${snapshot.activeProfileEnabledHeaderCount} enabled)`,
    `Storage active filters: ${snapshot.activeProfileFilterCount} (${snapshot.activeProfileEnabledFilterCount} enabled)`,
  ];
  for (const [index, header] of (snapshot.activeProfileHeaders || []).entries()) {
    lines.push(
      `Header ${index + 1}: ${header.enabled ? 'on' : 'off'} ${header.type} ${header.name || '<empty>'} = ${header.value || '<empty>'}`
    );
  }
  for (const [index, filter] of (snapshot.activeProfileFilters || []).entries()) {
    lines.push(
      `Filter ${index + 1}: ${filter.enabled ? 'on' : 'off'} ${filter.type} ${filter.value || '<empty>'}`
    );
  }
  return lines;
}

/**
 * Refresh the debug panel (read-only: never changes the extension state)
 */
export async function updateDebugPanel(): Promise<void> {
  const debugState = await getBackgroundDebugState();
  const yes = getMessage('yes');
  const no = getMessage('no');

  let dynamicRules: chrome.declarativeNetRequest.Rule[] = [];
  let activeRuleCount = 0;
  let syncStatus = '-';
  let snapshot: StorageSnapshot | null = null;

  if (debugState?.success) {
    dynamicRules = Array.isArray(debugState.dynamicRules) ? debugState.dynamicRules : [];
    activeRuleCount = Number(debugState.activeRuleCount ?? dynamicRules.length) || 0;
    snapshot = debugState.storageSnapshot ?? null;
    syncStatus = `${debugState.lastComputedRuleCount}/${debugState.lastAppliedRuleCount}`;
    if (debugState.lastError) {
      syncStatus = `ERR: ${debugState.lastError}`;
    } else if (snapshot) {
      syncStatus += ` | storage:${snapshot.profileCount}/${snapshot.profilesToApplyCount}/${snapshot.globalEnabled ? 'on' : 'off'}`;
    }
  }

  setText('debug-rules-count', String(activeRuleCount));
  setText('debug-global-enabled', snapshot ? (snapshot.globalEnabled ? yes : no) : '-');
  setText('debug-active-profile', snapshot?.activeProfileName || '-');
  setText('debug-rule-sync', syncStatus);

  try {
    const bytesUsed = await browserAPI.storage.local.getBytesInUse();
    setText('debug-storage-size', `${(bytesUsed / 1024).toFixed(2)} KB`);
  } catch {
    // getBytesInUse is not implemented in every Firefox version
    setText('debug-storage-size', '-');
  }

  const preview =
    dynamicRules.length > 0
      ? dynamicRules.slice(0, 8).map(describeRule)
      : [getMessage('debugNoRules'), ...(snapshot ? describeSnapshot(snapshot, yes, no) : [])];
  setText('debug-rules-preview', preview.join('\n'));
}
