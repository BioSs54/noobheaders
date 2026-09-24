import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing of the NoobHeaders extension.
 * Run `pnpm run package` first: the tests load the packaged extensions from ./packages.
 *
 * - e2e/engine: header engine flows driven from the extension background, in Chromium
 *   (MV3, declarativeNetRequest) and Firefox (MV2, webRequest).
 * - e2e/flows: UI flows (popup, options). Chromium only: Firefox forbids automation of
 *   moz-extension:// pages (both with Playwright's Juggler and WebDriver BiDi).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1, // Extensions need to be loaded one at a time
  timeout: 45000,
  expect: { timeout: 7000 },
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      testMatch: 'engine/**/*.spec.ts',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
});
