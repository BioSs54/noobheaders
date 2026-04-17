import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { type BrowserContext, test as base, chromium, firefox } from '@playwright/test';
import { closeServer, createTestServer } from './test-server.js';

function getExtensionPath(projectName: string): string {
  const packageDir = projectName === 'chromium' ? 'chrome' : projectName;
  return path.join(process.cwd(), 'packages', packageDir);
}

/**
 * Custom test fixture that loads the extension and starts a local test server
 */
export const test = base.extend<
  {
    context: BrowserContext;
    extensionId: string;
    testServerUrl: string;
  },
  {
    testServer: Server;
  }
>({
  // Worker-scoped fixture: one test server per worker
  testServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured first parameter
    async ({}, use) => {
      const server = await createTestServer(0);
      console.log('✅ Test server started');
      await use(server);
      await closeServer(server);
      console.log('🛑 Test server stopped');
    },
    { scope: 'worker' },
  ],

  testServerUrl: async ({ testServer }, use) => {
    const address = testServer.address() as AddressInfo | null;
    const port = address?.port;

    if (!port) {
      throw new Error('Test server did not expose a valid port');
    }

    await use(`http://localhost:${port}`);
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
  context: async ({}, use, testInfo) => {
    const pathToExtension = getExtensionPath(testInfo.project.name);

    let context: BrowserContext;

    if (testInfo.project.name === 'firefox') {
      // Firefox: use firefox.launchPersistentContext with userDataDir
      const firefoxProfilePath = path.join(process.cwd(), '.firefox-profile');
      context = await firefox.launchPersistentContext(firefoxProfilePath, {
        headless: false,
      });

      // Note: Firefox extension loading via Playwright is limited
      // The extension needs to be manually installed or use web-ext
    } else {
      // Chromium: use chromium.launchPersistentContext
      context = await chromium.launchPersistentContext('', {
        headless: false,
        args: [
          `--disable-extensions-except=${pathToExtension}`,
          `--load-extension=${pathToExtension}`,
          '--no-sandbox',
        ],
      });
    }

    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use, testInfo) => {
    // Wait for extension to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    if (testInfo.project.name === 'firefox') {
      // Firefox: extension ID is hardcoded in manifest
      await use('noobheaders@bioss54.github.io');
    } else {
      // Chromium: get service worker (background script)
      let [background] = context.serviceWorkers();
      if (!background) {
        background = await context.waitForEvent('serviceworker', { timeout: 5000 });
      }

      // Extract extension ID from service worker URL
      const extensionId = background.url().split('/')[2];

      await use(extensionId);
    }
  },
});

export { expect } from '@playwright/test';
