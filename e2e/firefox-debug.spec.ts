import { expect, test } from './fixtures';

/**
 * Firefox-specific debug tests
 * Kept as reference only. Use `pnpm test:firefox` for the supported manual workflow.
 */

test.describe.skip('Firefox Header Application Debug', () => {
  test('should apply request headers in Firefox', async ({
    context,
    extensionId,
    testServerUrl,
  }) => {
    // Skip if not Firefox
    if (!extensionId.includes('@bioss54')) {
      test.skip();
    }

    console.log('🦊 Running Firefox debug test');
    console.log('Extension ID:', extensionId);

    // Open popup
    const popupUrl = `moz-extension://${extensionId}/popup.html`;
    const popupPage = await context.newPage();
    await popupPage.goto(popupUrl);
    await popupPage.waitForLoadState('networkidle');

    console.log('✅ Popup loaded');

    // Enable global toggle
    const globalToggle = popupPage.locator('#global-enabled');
    await globalToggle.check();
    console.log('✅ Global toggle enabled');

    await popupPage.waitForTimeout(500);

    // Add a header
    const addHeaderBtn = popupPage
      .locator('button:has-text("Add Header"), button:has-text("+")')
      .first();
    await addHeaderBtn.click();
    console.log('✅ Clicked add header button');

    await popupPage.waitForTimeout(500);

    // Fill header details
    const headerInputs = popupPage.locator('.header-item').last();
    const nameInput = headerInputs
      .locator('input[placeholder*="Header Name"], input[placeholder*="Name"]')
      .first();
    const valueInput = headerInputs
      .locator('input[placeholder*="Header Value"], input[placeholder*="Value"]')
      .first();

    await nameInput.fill('X-Firefox-Test');
    await valueInput.fill('HelloFromPlaywright');
    console.log('✅ Filled header name and value');

    await popupPage.waitForTimeout(500);

    // Enable the profile
    const profileToggle = popupPage.locator('.profile-toggle input[type="checkbox"]').first();
    const isChecked = await profileToggle.isChecked();
    if (!isChecked) {
      await profileToggle.check();
      console.log('✅ Profile enabled');
    }

    await popupPage.waitForTimeout(1000);

    // Open test server page
    const testPage = await context.newPage();

    // Listen for requests to capture headers
    const requestHeaders: Record<string, string> = {};
    testPage.on('request', (request) => {
      const headers = request.headers();
      Object.assign(requestHeaders, headers);
      console.log('📡 Request headers:', Object.keys(headers));
    });

    await testPage.goto(testServerUrl);
    await testPage.waitForLoadState('networkidle');

    console.log('🔍 All captured headers:', requestHeaders);
    console.log('🎯 Looking for X-Firefox-Test header...');

    // Check if our custom header is present
    const customHeaderExists = 'x-firefox-test' in requestHeaders;
    console.log('Custom header found:', customHeaderExists);

    if (customHeaderExists) {
      console.log('✅ Header value:', requestHeaders['x-firefox-test']);
      expect(requestHeaders['x-firefox-test']).toBe('HelloFromPlaywright');
    } else {
      console.error('❌ Custom header NOT found!');
      console.error('Available headers:', Object.keys(requestHeaders));

      // Take screenshot for debugging
      await popupPage.screenshot({ path: 'debug-firefox-popup.png' });
      await testPage.screenshot({ path: 'debug-firefox-page.png' });

      throw new Error('X-Firefox-Test header was not applied to the request');
    }
  });

  test('should show background script logs', async ({ context, extensionId }) => {
    // Skip if not Firefox
    if (!extensionId.includes('@bioss54')) {
      test.skip();
    }

    console.log('🦊 Checking background script logs');

    // Open background page (if accessible in Firefox)
    const backgroundUrl = `moz-extension://${extensionId}/background.html`;

    try {
      const bgPage = await context.newPage();
      await bgPage.goto(backgroundUrl, { timeout: 5000 });
      console.log('✅ Background page accessible');
    } catch (error) {
      console.log('⚠️  Background page not accessible (normal for Firefox MV2)');
    }

    // At least verify the extension is loaded
    const popupUrl = `moz-extension://${extensionId}/popup.html`;
    const popupPage = await context.newPage();
    await popupPage.goto(popupUrl);

    const title = await popupPage.title();
    console.log('Extension title:', title);
    expect(title).toBeTruthy();
  });
});
