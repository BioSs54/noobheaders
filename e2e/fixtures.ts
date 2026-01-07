import path from 'node:path';
import { type BrowserContext, test as base, chromium } from '@playwright/test';
import { closeServer, createTestServer } from './test-server.js';

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
    testServer: any;
  }
>({
  // Worker-scoped fixture: one test server per worker
  testServer: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture API requires destructured first parameter
    async ({}, use) => {
      const server = await createTestServer(3456);
      console.log('✅ Test server started');
      await use(server);
      await closeServer(server);
      console.log('🛑 Test server stopped');
    },
    { scope: 'worker' },
  ],

  testServerUrl: async ({ testServer }, use) => {
    await use('http://localhost:3456');
  },

  // biome-ignore lint/correctness/noEmptyPattern: Playwright fixture pattern
  context: async ({}, use) => {
    const pathToExtension = path.join(process.cwd(), 'dist');
    const context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [
        `--disable-extensions-except=${pathToExtension}`,
        `--load-extension=${pathToExtension}`,
        '--no-sandbox',
      ],
    });
    await use(context);
    await context.close();
  },
  extensionId: async ({ context }, use) => {
    // Wait for extension to load
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Get service worker (background script)
    let [background] = context.serviceWorkers();
    if (!background) {
      background = await context.waitForEvent('serviceworker', { timeout: 5000 });
    }

    // Extract extension ID from service worker URL
    const extensionId = background.url().split('/')[2];

    await use(extensionId);
  },
});

export { expect } from '@playwright/test';
