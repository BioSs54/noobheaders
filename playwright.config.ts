import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for E2E testing of NoobHeaders extension
 * Automatic E2E coverage is limited to Chromium.
 * Firefox validation is handled manually through web-ext.
 */
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['**/firefox-debug.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Extensions need to be loaded one at a time
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    trace: 'on-first-retry',
    headless: false, // Extensions don't work in headless mode
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
