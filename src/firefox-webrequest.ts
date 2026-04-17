/**
 * Firefox webRequest-based header modification (Manifest V2)
 * Uses webRequest API to modify headers on the fly
 */

import { getBrowserApi } from './browser-compat.js';
import { headerAppliesToUrl } from './header-utils.js';
import type { Profile } from './types/index.js';

let activeProfiles: Profile[] = [];

/**
 * Apply headers using webRequest API (Firefox MV2)
 * @param profiles - Profiles to apply (already filtered in background.ts)
 * @param globalEnabled - Whether global toggle is enabled
 */
export function applyHeadersWebRequest(profiles: Profile[], globalEnabled: boolean): void {
  const browserAPI = getBrowserApi() as typeof browser;

  if (!browserAPI.webRequest?.onBeforeSendHeaders || !browserAPI.webRequest?.onHeadersReceived) {
    console.warn('[NoobHeaders] webRequest API is unavailable in this browser context');
    activeProfiles = [];
    return;
  }

  // Clear existing listeners (use onBeforeSendHeaders for request headers)
  if (browserAPI.webRequest.onBeforeSendHeaders.hasListener(modifyRequestHeaders)) {
    browserAPI.webRequest.onBeforeSendHeaders.removeListener(modifyRequestHeaders);
  }
  if (browserAPI.webRequest.onHeadersReceived.hasListener(modifyResponseHeaders)) {
    browserAPI.webRequest.onHeadersReceived.removeListener(modifyResponseHeaders);
  }

  // Clear active profiles
  activeProfiles = [];

  if (!globalEnabled || profiles.length === 0) {
    return;
  }

  // Store the profiles to apply (already filtered by background.ts)
  activeProfiles = profiles;

  // Register listeners if we have profiles to apply
  if (activeProfiles.length > 0) {
    browserAPI.webRequest.onBeforeSendHeaders.addListener(
      modifyRequestHeaders,
      { urls: ['<all_urls>'] },
      ['blocking', 'requestHeaders']
    );

    browserAPI.webRequest.onHeadersReceived.addListener(
      modifyResponseHeaders,
      { urls: ['<all_urls>'] },
      ['blocking', 'responseHeaders']
    );
  }
}

/**
 * Modify request headers
 */
function modifyRequestHeaders(details: any): any {
  if (!details.requestHeaders) return;

  let headers = [...details.requestHeaders];
  let modified = false;

  // Process each active profile
  for (const profile of activeProfiles) {
    for (const header of profile.headers || []) {
      if (!header.name || header.type !== 'request') continue;

      if (!headerAppliesToUrl(profile, header, details.url)) continue;

      // Remove existing headers with this name (case-insensitive)
      headers = headers.filter((h) => h.name.toLowerCase() !== header.name.toLowerCase());

      // Add new header if value is provided
      if (header.value !== undefined && header.value !== '') {
        headers.push({
          name: header.name,
          value: header.value,
        });
      }

      modified = true;
    }
  }

  if (modified) {
    return { requestHeaders: headers };
  }
}

/**
 * Modify response headers
 */
function modifyResponseHeaders(details: any): any {
  if (!details.responseHeaders) return;

  let headers = [...details.responseHeaders];
  let modified = false;

  // Process each active profile
  for (const profile of activeProfiles) {
    for (const header of profile.headers || []) {
      if (!header.name || header.type !== 'response') continue;

      if (!headerAppliesToUrl(profile, header, details.url)) continue;

      // Remove existing headers with this name (case-insensitive)
      headers = headers.filter((h) => h.name.toLowerCase() !== header.name.toLowerCase());

      // Add new header if value is provided
      if (header.value !== undefined && header.value !== '') {
        headers.push({
          name: header.name,
          value: header.value,
        });
      }

      modified = true;
    }
  }

  if (modified) {
    return { responseHeaders: headers };
  }
}
