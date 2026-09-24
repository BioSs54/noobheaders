import type { Page } from '@playwright/test';
import { type ExtensionBackground, expect, test } from '../fixtures';
import {
  expectRequestHeader,
  expectResponseHeader,
  filter,
  header,
  profile,
  receivedRequestHeaders,
  STORAGE_KEYS,
  type TestProfile,
} from '../helpers';

/**
 * Header engine flows, driven from the extension background (no UI involved) so that they
 * run in every browser: declarativeNetRequest in Chromium, webRequest in Firefox.
 * UI flows live in e2e/flows (Chromium only: Firefox does not let automation drive
 * moz-extension:// pages).
 */

interface EngineState {
  profiles: TestProfile[];
  activeProfileId?: string;
  globalEnabled?: boolean;
  extra?: Record<string, unknown>;
}

async function setStorage(
  background: ExtensionBackground,
  values: Record<string, unknown>
): Promise<void> {
  await background.evaluate(async (items) => {
    const runtime = globalThis as any;
    const api = runtime.browser ?? runtime.chrome;
    await api.storage.local.set(items);
  }, values);
}

async function seed(background: ExtensionBackground, state: EngineState): Promise<void> {
  await setStorage(background, {
    [STORAGE_KEYS.profiles]: state.profiles,
    [STORAGE_KEYS.activeProfile]: state.activeProfileId ?? state.profiles[0]?.id ?? null,
    [STORAGE_KEYS.globalEnabled]: state.globalEnabled ?? true,
    showBadge: true,
    ...(state.extra ?? {}),
  });
}

function readStorageValue<T>(background: ExtensionBackground, key: string): Promise<T> {
  return background.evaluate(async (storageKey) => {
    const runtime = globalThis as any;
    const api = runtime.browser ?? runtime.chrome;
    const data = await api.storage.local.get(storageKey);
    return data[storageKey] ?? null;
  }, key);
}

async function badgeText(background: ExtensionBackground): Promise<string> {
  const { text, activeUrl } = await background.evaluate(async () => {
    const runtime = globalThis as any;
    const api = runtime.browser ?? runtime.chrome;
    const [tab] = await api.tabs.query({ active: true, currentWindow: true });
    return {
      text: (await (api.action ?? api.browserAction).getBadgeText({})) as string,
      activeUrl: (tab?.url ?? null) as string | null,
    };
  });
  if (process.env.E2E_DEBUG === '1') console.log(`[badge] "${text}" active tab: ${activeUrl}`);
  return text;
}

test.describe('Header engine', () => {
  let probe: Page;

  test.beforeEach(async ({ context }) => {
    probe = await context.newPage();
  });

  test('applies enabled profiles only, and nothing when globally disabled', async ({
    background,
    testServerUrl,
  }) => {
    await seed(background, {
      profiles: [
        profile('Selected', { enabled: false, headers: [header('X-Selected', '1')] }),
        profile('Enabled', { headers: [header('X-Enabled', '1')] }),
      ],
      activeProfileId: 'Selected',
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Enabled', '1');
    await expectRequestHeader(probe, testServerUrl, 'X-Selected', undefined);

    await setStorage(background, { [STORAGE_KEYS.globalEnabled]: false });
    await expectRequestHeader(probe, testServerUrl, 'X-Enabled', undefined);

    await setStorage(background, { [STORAGE_KEYS.globalEnabled]: true });
    await expectRequestHeader(probe, testServerUrl, 'X-Enabled', '1');
  });

  test('sets response headers and removes headers with an empty value', async ({
    background,
    testServerUrl,
  }) => {
    await seed(background, {
      profiles: [
        profile('Work', {
          headers: [
            header('X-Injected-Response', 'injected', { type: 'response' }),
            header('X-Original-Response', 'overridden', { type: 'response' }),
            header('Accept-Language', ''),
            header('X-Control', 'present'),
          ],
        }),
      ],
    });

    await expectResponseHeader(probe, testServerUrl, 'X-Injected-Response', 'injected');
    await expectResponseHeader(probe, testServerUrl, 'X-Original-Response', 'overridden');
    await expectRequestHeader(probe, testServerUrl, 'X-Control', 'present');
    expect((await receivedRequestHeaders(probe, testServerUrl))['accept-language']).toBeUndefined();
  });

  test('domain filters, URL patterns (ports, wildcards) and OR semantics', async ({
    background,
    testServerUrl,
    altServerUrl,
  }) => {
    const port = new URL(testServerUrl).port;
    await seed(background, {
      profiles: [
        profile('Domain', { headers: [header('X-Domain', 'yes')], filters: [filter('localhost')] }),
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
        profile('Unrestricted', {
          headers: [header('X-Unrestricted', 'yes')],
          filters: [filter('example.com', { enabled: false }), filter('')],
        }),
      ],
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Domain', 'yes');
    await expectRequestHeader(probe, altServerUrl, 'X-Domain', undefined);
    await expectRequestHeader(probe, altServerUrl, 'X-Port', 'yes');
    await expectRequestHeader(probe, testServerUrl, 'X-Port', undefined);
    await expectRequestHeader(probe, testServerUrl, 'X-Path', 'yes');
    await expectRequestHeader(probe, testServerUrl, 'X-Or', 'yes');
    await expectRequestHeader(probe, altServerUrl, 'X-Or', 'yes');
    await expectRequestHeader(probe, testServerUrl, 'X-Nomatch', undefined);
    await expectRequestHeader(probe, altServerUrl, 'X-Unrestricted', 'yes');
  });

  test('invalid headers and filters never break the valid rules', async ({
    background,
    testServerUrl,
  }) => {
    await seed(background, {
      profiles: [
        profile('Broken', {
          headers: [header('Bad Header', 'x'), header('X-Valid', 'still-works')],
        }),
        profile('Invalid filter', {
          headers: [header('X-Invalid-Filter', 'never')],
          filters: [filter('*.example.com:bad', { type: 'domain' })],
        }),
      ],
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Valid', 'still-works');
    await expectRequestHeader(probe, testServerUrl, 'X-Invalid-Filter', undefined);
  });

  test('the selected profile wins when several profiles set the same header', async ({
    background,
    testServerUrl,
  }) => {
    await seed(background, {
      profiles: [
        profile('Base', { headers: [header('X-Base', '1'), header('X-Env', 'base')] }),
        profile('Override', { headers: [header('X-Env', 'override')] }),
      ],
      activeProfileId: 'Override',
    });

    await expectRequestHeader(probe, testServerUrl, 'X-Base', '1');
    await expectRequestHeader(probe, testServerUrl, 'X-Env', 'override');

    await setStorage(background, { [STORAGE_KEYS.activeProfile]: 'Base' });
    await expectRequestHeader(probe, testServerUrl, 'X-Env', 'base');
  });

  test('the badge counts the headers applying to the active tab', async ({
    background,
    context,
    testServerUrl,
    altServerUrl,
  }) => {
    await seed(background, {
      profiles: [
        profile('Scoped', {
          headers: [header('X-A', '1'), header('X-B', '2'), header('Bad Name', 'x')],
          filters: [filter('localhost')],
        }),
      ],
    });

    await probe.goto(`${testServerUrl}/page`);
    await probe.bringToFront();
    await expect.poll(() => badgeText(background)).toBe('2');

    const other = await context.newPage();
    await other.goto(`${altServerUrl}/page`);
    await other.bringToFront();
    await expect.poll(() => badgeText(background)).toBe('');

    // Closing the active tab re-activates the previous one
    await other.close();
    await expect.poll(() => badgeText(background)).toBe('2');

    await setStorage(background, { showBadge: false });
    await expect.poll(() => badgeText(background)).toBe('');
  });

  test('auto-selects the enabled profile matching the visited site', async ({
    background,
    context,
    testServerUrl,
    altServerUrl,
  }) => {
    await seed(background, {
      profiles: [
        profile('Default', { headers: [header('X-Default', '1')] }),
        profile('Disabled local', { enabled: false, filters: [filter('127.0.0.1')] }),
        profile('Local', { filters: [filter('localhost')] }),
      ],
      activeProfileId: 'Default',
    });

    await probe.goto(`${altServerUrl}/page`);
    await probe.bringToFront();
    await probe.waitForTimeout(500);
    expect(await readStorageValue(background, STORAGE_KEYS.activeProfile)).toBe('Default');

    const local = await context.newPage();
    await local.goto(`${testServerUrl}/page`);
    await local.bringToFront();
    await expect.poll(() => readStorageValue(background, STORAGE_KEYS.activeProfile)).toBe('Local');
  });
});
