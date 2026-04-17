/**
 * Browser compatibility utilities
 * Detects browser and provides appropriate APIs
 */

export type BrowserType = 'chrome' | 'firefox';

type BrowserApi = typeof chrome | typeof browser;

/**
 * Detect which browser is running
 */
export function detectBrowser(): BrowserType {
  // Prefer feature detection over namespace detection because Chromium exposes
  // both `chrome` and `browser` in many extension contexts.
  if (typeof chrome !== 'undefined' && typeof chrome.declarativeNetRequest !== 'undefined') {
    return 'chrome';
  }

  if (typeof navigator !== 'undefined' && /firefox/i.test(navigator.userAgent)) {
    return 'firefox';
  }

  if (typeof browser !== 'undefined' && browser.runtime && typeof chrome === 'undefined') {
    return 'firefox';
  }

  return 'chrome';
}

/**
 * Check if browser supports declarativeNetRequest (Manifest V3)
 */
export function supportsDeclarativeNetRequest(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.declarativeNetRequest !== 'undefined';
}

/**
 * Check if browser supports webRequest blocking (Manifest V2)
 */
export function supportsWebRequestBlocking(): boolean {
  const browserAPI = getBrowserApi() as BrowserApi & { webRequest?: unknown };
  return typeof browserAPI !== 'undefined' && typeof browserAPI.webRequest !== 'undefined';
}

/**
 * Resolve the current browser API implementation.
 */
export function getBrowserApi(): BrowserApi {
  if (detectBrowser() === 'firefox' && typeof browser !== 'undefined' && browser.runtime) {
    return browser;
  }

  return chrome;
}

/**
 * Resolve the badge/action API across MV2 and MV3 browsers.
 */
export function getActionApi() {
  const browserAPI = getBrowserApi() as BrowserApi & {
    action?: typeof chrome.action;
    browserAction?: typeof browser.browserAction;
  };

  return browserAPI.action ?? browserAPI.browserAction;
}

/**
 * Return the UI language in a cross-browser way.
 */
export function getUiLanguage(): string {
  const browserAPI = getBrowserApi() as BrowserApi & {
    i18n: {
      getUILanguage?: () => string;
      getMessage: (name: string) => string;
    };
  };

  return browserAPI.i18n.getUILanguage?.() ?? browserAPI.i18n.getMessage('@@ui_locale') ?? 'en';
}
