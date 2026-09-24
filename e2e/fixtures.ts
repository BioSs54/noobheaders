import { mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { type BrowserContext, test as base, chromium, firefox } from '@playwright/test';
import { getFreePort, installTemporaryAddon } from './firefox-rdp';
import { closeServer, createTestServer } from './test-server.js';

export const FIREFOX_EXTENSION_ID = 'noobheaders@bioss54.github.io';
// Fixed internal UUID so that moz-extension:// URLs are predictable
const FIREFOX_EXTENSION_UUID = '6c6b2f2e-4d0c-4a53-9f1f-6e0b2d7a1c11';

export type BrowserKind = 'chromium' | 'firefox';

/** Verbose fixture logs, enabled with E2E_DEBUG=1 (used in CI to diagnose browser setup) */
export function debugLog(...args: unknown[]): void {
  if (process.env.E2E_DEBUG === '1') console.log('[e2e]', ...args);
}

function getExtensionPath(kind: BrowserKind): string {
  return path.join(process.cwd(), 'packages', kind === 'chromium' ? 'chrome' : 'firefox');
}

export interface ExtensionFixtures {
  /** UI language used to launch the browser */
  uiLocale: string;
  browserKind: BrowserKind;
  context: BrowserContext;
  extensionId: string;
  /** Base URL of the extension pages, e.g. chrome-extension://<id> */
  extensionOrigin: string;
  /** Test server reached through `localhost` */
  testServerUrl: string;
  /** Same test server reached through `127.0.0.1` (a different host for filters) */
  altServerUrl: string;
}

/**
 * Loads the packaged extension in Chromium or Firefox and starts a local test server.
 */
export const test = base.extend<ExtensionFixtures, { testServer: Server }>({
  uiLocale: ['en', { option: true }],

  testServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured first parameter
    async ({}, use) => {
      const server = await createTestServer(0);
      await use(server);
      await closeServer(server);
    },
    { scope: 'worker' },
  ],

  testServerUrl: async ({ testServer }, use) => {
    const { port } = testServer.address() as AddressInfo;
    await use(`http://localhost:${port}`);
  },

  altServerUrl: async ({ testServer }, use) => {
    const { port } = testServer.address() as AddressInfo;
    await use(`http://127.0.0.1:${port}`);
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured first parameter
  browserKind: async ({}, use, testInfo) => {
    await use(testInfo.project.name === 'firefox' ? 'firefox' : 'chromium');
  },

  context: async ({ browserKind, uiLocale }, use) => {
    const extensionPath = getExtensionPath(browserKind);

    if (browserKind === 'firefox') {
      const debuggerPort = await getFreePort();
      const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'noobheaders-e2e-ff-'));
      // The Playwright Firefox build (Juggler) cannot drive moz-extension:// pages, so a stock
      // Firefox is driven through WebDriver BiDi (`moz-firefox` channel). Its path can be set
      // with FIREFOX_BIN (CI installs it with browser-actions/setup-firefox).
      const context = await firefox.launchPersistentContext(userDataDir, {
        channel: 'moz-firefox',
        executablePath: process.env.FIREFOX_BIN || undefined,
        headless: process.env.HEADED !== '1',
        locale: uiLocale,
        args: ['-start-debugger-server', String(debuggerPort)],
        firefoxUserPrefs: {
          'devtools.debugger.remote-enabled': true,
          'devtools.debugger.prompt-connection': false,
          'devtools.chrome.enabled': true,
          'extensions.webextensions.uuids': JSON.stringify({
            [FIREFOX_EXTENSION_ID]: FIREFOX_EXTENSION_UUID,
          }),
          'intl.locale.requested': uiLocale,
        },
      });
      debugLog('firefox launched, debugger port', debuggerPort);
      const addonId = await installTemporaryAddon(debuggerPort, extensionPath);
      debugLog('temporary add-on installed', addonId);
      await use(context);
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
      return;
    }

    const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'noobheaders-e2e-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      // Chromium loads extensions only in headed mode or with the new headless mode
      headless: false,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
      locale: uiLocale,
      env: { ...process.env, LANGUAGE: uiLocale, LANG: `${uiLocale}.UTF-8` },
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--lang=${uiLocale}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context, browserKind }, use) => {
    if (browserKind === 'firefox') {
      await use(FIREFOX_EXTENSION_UUID);
      return;
    }

    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 10000 });
    }
    await use(background.url().split('/')[2]);
  },

  extensionOrigin: async ({ extensionId, browserKind }, use) => {
    await use(
      browserKind === 'firefox'
        ? `moz-extension://${extensionId}`
        : `chrome-extension://${extensionId}`
    );
  },
});

export { expect } from '@playwright/test';
