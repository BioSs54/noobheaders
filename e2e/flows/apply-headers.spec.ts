import type { BrowserContext, Page } from '@playwright/test';
import { expect, test } from '../fixtures';
import {
  addHeaderViaUi,
  expectRequestHeader,
  expectResponseHeader,
  filter,
  header,
  openPopup,
  profile,
  receivedRequestHeaders,
  seedState,
  setGlobalEnabled,
  setProfileEnabled,
} from '../helpers';

/**
 * End-to-end flows checking what the test server actually receives.
 * `localhost` and `127.0.0.1` reach the same server under two different hosts.
 */
test.describe('Header application on real requests', () => {
  let popup: Page;
  let probe: Page;

  async function setup(context: BrowserContext, extensionOrigin: string) {
    popup = await openPopup(context, extensionOrigin);
    probe = await context.newPage();
  }

  test('full flow from the UI: global switch + profile switch + header', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, { profiles: [profile('Work', { enabled: false })] });

    await addHeaderViaUi(popup, 'X-From-Ui', 'hello');
    // Nothing applies until both switches are on
    await expectRequestHeader(probe, testServerUrl, 'X-From-Ui', undefined);

    await setGlobalEnabled(popup, true);
    await expectRequestHeader(probe, testServerUrl, 'X-From-Ui', undefined);

    await setProfileEnabled(popup, 'Work', true);
    await expectRequestHeader(probe, testServerUrl, 'X-From-Ui', 'hello');

    // Editing the value updates the rule
    await popup.locator('.header-value').fill('updated');
    await popup.locator('.header-value').blur();
    await expectRequestHeader(probe, testServerUrl, 'X-From-Ui', 'updated');

    // Switching the header off removes it
    await popup.locator('.header-item .toggle-slider').click();
    await expectRequestHeader(probe, testServerUrl, 'X-From-Ui', undefined);
  });

  test('a disabled profile is never applied, even when selected', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Selected', { enabled: false, headers: [header('X-Selected', '1')] }),
        profile('Enabled', { enabled: true, headers: [header('X-Enabled', '1')] }),
      ],
      activeProfileId: 'Selected',
      globalEnabled: true,
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Enabled', '1');
    await expectRequestHeader(probe, testServerUrl, 'X-Selected', undefined);
  });

  test('the global switch turns everything off', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [profile('Work', { headers: [header('X-Global', 'on')] })],
      globalEnabled: true,
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Global', 'on');
    await setGlobalEnabled(popup, false);
    await expectRequestHeader(probe, testServerUrl, 'X-Global', undefined);
    await setGlobalEnabled(popup, true);
    await expectRequestHeader(probe, testServerUrl, 'X-Global', 'on');
  });

  test('response headers are set on responses', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Work', {
          headers: [
            header('X-Injected-Response', 'injected', { type: 'response' }),
            header('X-Original-Response', 'overridden', { type: 'response' }),
          ],
        }),
      ],
      globalEnabled: true,
    });

    await expectResponseHeader(probe, testServerUrl, 'X-Injected-Response', 'injected');
    await expectResponseHeader(probe, testServerUrl, 'X-Original-Response', 'overridden');
  });

  test('an empty value removes the header', async ({ context, extensionOrigin, testServerUrl }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Work', {
          headers: [header('Accept-Language', ''), header('X-Control', 'present')],
        }),
      ],
      globalEnabled: true,
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Control', 'present');
    const headers = await receivedRequestHeaders(probe, testServerUrl);
    expect(headers['accept-language']).toBeUndefined();
  });

  test('domain filters target a host and its subdomains only', async ({
    context,
    extensionOrigin,
    testServerUrl,
    altServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Scoped', {
          headers: [header('X-Scoped', 'yes')],
          filters: [filter('localhost')],
        }),
        profile('Everywhere', { headers: [header('X-Everywhere', 'yes')] }),
      ],
      globalEnabled: true,
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Scoped', 'yes');
    await expectRequestHeader(probe, altServerUrl, 'X-Everywhere', 'yes');
    await expectRequestHeader(probe, altServerUrl, 'X-Scoped', undefined);
  });

  test('URL patterns support ports, wildcards and are OR-ed with domains', async ({
    context,
    extensionOrigin,
    testServerUrl,
    altServerUrl,
  }) => {
    const port = new URL(testServerUrl).port;
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Port', {
          headers: [header('X-Port', 'yes')],
          filters: [filter(`127.0.0.1:${port}`)],
        }),
        profile('Path', {
          headers: [header('X-Path', 'yes')],
          filters: [filter('*://localhost:*/head*')],
        }),
        profile('Or', {
          headers: [header('X-Or', 'yes')],
          filters: [filter(`*://127.0.0.1:${port}/*`), filter('localhost')],
        }),
        profile('Nomatch', {
          headers: [header('X-Nomatch', 'yes')],
          filters: [filter('*://localhost:*/other/*'), filter('example.com')],
        }),
      ],
      globalEnabled: true,
    });

    await expectRequestHeader(probe, altServerUrl, 'X-Port', 'yes');
    await expectRequestHeader(probe, testServerUrl, 'X-Port', undefined);
    await expectRequestHeader(probe, testServerUrl, 'X-Path', 'yes');
    await expectRequestHeader(probe, testServerUrl, 'X-Or', 'yes');
    await expectRequestHeader(probe, altServerUrl, 'X-Or', 'yes');
    await expectRequestHeader(probe, testServerUrl, 'X-Nomatch', undefined);
  });

  test('disabled or empty filters do not restrict headers', async ({
    context,
    extensionOrigin,
    altServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Work', {
          headers: [header('X-Unrestricted', 'yes')],
          filters: [filter('example.com', { enabled: false }), filter('')],
        }),
      ],
      globalEnabled: true,
    });

    await expectRequestHeader(probe, altServerUrl, 'X-Unrestricted', 'yes');
  });

  test('an invalid header or filter does not break the other rules', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Broken', {
          headers: [header('Bad Header', 'x'), header('X-Valid', 'still-works')],
        }),
        profile('Invalid filter', {
          headers: [header('X-Invalid-Filter', 'never')],
          filters: [filter('*.example.com:bad', { type: 'domain' })],
        }),
      ],
      globalEnabled: true,
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Valid', 'still-works');
    await expectRequestHeader(probe, testServerUrl, 'X-Invalid-Filter', undefined);
  });

  test('several enabled profiles combine; the selected one wins on conflicts', async ({
    context,
    extensionOrigin,
    testServerUrl,
  }) => {
    await setup(context, extensionOrigin);
    await seedState(popup, {
      profiles: [
        profile('Base', { headers: [header('X-Base', '1'), header('X-Env', 'base')] }),
        profile('Override', { headers: [header('X-Env', 'override')] }),
      ],
      activeProfileId: 'Override',
      globalEnabled: true,
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Base', '1');
    await expectRequestHeader(probe, testServerUrl, 'X-Env', 'override');

    await popup.getByRole('button', { name: 'Base', exact: true }).click();
    await expectRequestHeader(probe, testServerUrl, 'X-Env', 'base');
  });
});
