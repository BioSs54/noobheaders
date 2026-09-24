import type { BrowserContext, Locator, Page } from '@playwright/test';
import { expect } from './fixtures';

export const STORAGE_KEYS = {
  profiles: 'noobheaders_profiles',
  activeProfile: 'noobheaders_active_profile',
  globalEnabled: 'noobheaders_global_enabled',
} as const;

export interface TestHeader {
  enabled?: boolean;
  type?: 'request' | 'response';
  name: string;
  value: string;
}

export interface TestFilter {
  enabled?: boolean;
  type?: 'url' | 'domain';
  value: string;
}

export interface TestProfile {
  id: string;
  name: string;
  enabled?: boolean;
  headers?: TestHeader[];
  filters?: TestFilter[];
}

export function header(name: string, value: string, extra: Partial<TestHeader> = {}): TestHeader {
  return { enabled: true, type: 'request', name, value, ...extra };
}

export function filter(value: string, extra: Partial<TestFilter> = {}): TestFilter {
  const type = value.includes('/') || value.includes(':') ? 'url' : 'domain';
  return { enabled: true, type, value, ...extra };
}

export function profile(id: string, extra: Partial<TestProfile> = {}): TestProfile {
  return { id, name: id, enabled: true, headers: [], filters: [], ...extra };
}

function attachDebugLogs(page: Page, label: string): void {
  if (process.env.E2E_DEBUG !== '1') return;
  page.on('console', (message) => console.log(`[${label}] ${message.type()}: ${message.text()}`));
  page.on('pageerror', (error) => console.log(`[${label}] pageerror: ${error.message}`));
}

async function waitForExtensionPageReady(page: Page, pagePath: string): Promise<void> {
  if (pagePath === 'popup.html') {
    await page.locator('body[data-ready="true"]').waitFor();
  } else {
    await page.waitForLoadState('domcontentloaded');
  }
}

export async function openExtensionPage(
  context: BrowserContext,
  extensionOrigin: string,
  pagePath: 'popup.html' | 'options.html'
): Promise<Page> {
  const page = await context.newPage();
  attachDebugLogs(page, pagePath);
  await page.goto(`${extensionOrigin}/${pagePath}`);
  if (process.env.E2E_DEBUG === '1') console.log(`[e2e] opened ${page.url()}`);
  await waitForExtensionPageReady(page, pagePath);
  return page;
}

/** Reload an extension page (content-initiated: works in Firefox too) */
export async function reloadExtensionPage(page: Page): Promise<void> {
  await Promise.all([page.waitForEvent('load'), page.evaluate(() => window.location.reload())]);
  await waitForExtensionPageReady(page, new URL(page.url()).pathname.slice(1));
}

export function openPopup(context: BrowserContext, extensionOrigin: string): Promise<Page> {
  return openExtensionPage(context, extensionOrigin, 'popup.html');
}

export function openOptions(context: BrowserContext, extensionOrigin: string): Promise<Page> {
  return openExtensionPage(context, extensionOrigin, 'options.html');
}

/**
 * Replace the whole extension storage, then reload the page so the UI reflects it.
 */
export async function seedState(
  page: Page,
  state: {
    profiles: TestProfile[];
    activeProfileId?: string;
    globalEnabled?: boolean;
    extra?: Record<string, unknown>;
  }
): Promise<void> {
  await page.evaluate(
    async ({ state, keys }) => {
      const runtime = globalThis as any;
      const api = runtime.browser ?? runtime.chrome;
      window.localStorage.clear();
      // Remove then overwrite instead of clear(): clearing would make an open popup
      // recreate its default profile concurrently
      const existing = await api.storage.local.get(null);
      const obsolete = Object.keys(existing).filter((key) => !Object.values(keys).includes(key));
      if (obsolete.length > 0) await api.storage.local.remove(obsolete);
      await api.storage.local.set({
        [keys.profiles]: state.profiles,
        [keys.activeProfile]: state.activeProfileId ?? state.profiles[0]?.id ?? null,
        [keys.globalEnabled]: state.globalEnabled ?? false,
        ...(state.extra ?? {}),
      });
      await api.runtime.sendMessage({ action: 'updateRules' });
    },
    { state, keys: STORAGE_KEYS }
  );
  await reloadExtensionPage(page);
}

export async function readStorage(page: Page): Promise<Record<string, any>> {
  return page.evaluate(async () => {
    const runtime = globalThis as any;
    const api = runtime.browser ?? runtime.chrome;
    return api.storage.local.get(null);
  });
}

export async function readProfiles(page: Page): Promise<TestProfile[]> {
  const data = await readStorage(page);
  return data[STORAGE_KEYS.profiles] ?? [];
}

export async function readActiveProfileId(page: Page): Promise<string | null> {
  const data = await readStorage(page);
  return data[STORAGE_KEYS.activeProfile] ?? null;
}

/** Blur the focused field so that the popup flushes its debounced save */
export async function flushEdits(page: Page): Promise<void> {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

export function profileRow(page: Page, name: string): Locator {
  return page.locator('.profile-row').filter({
    has: page.getByRole('button', { name, exact: true }),
  });
}

/** Click the visible slider of a toggle and wait for the checkbox to reach `checked` */
export async function setToggle(toggle: Locator, checked: boolean): Promise<void> {
  const input = toggle.locator('input[type="checkbox"]');
  if ((await input.isChecked()) !== checked) {
    await toggle.locator('.toggle-slider').click();
  }
  await expect(input).toBeChecked({ checked });
}

export async function setGlobalEnabled(page: Page, enabled: boolean): Promise<void> {
  await setToggle(page.locator('.global-toggle'), enabled);
  await expect
    .poll(async () => Boolean((await readStorage(page))[STORAGE_KEYS.globalEnabled]))
    .toBe(enabled);
}

export async function setProfileEnabled(page: Page, name: string, enabled: boolean) {
  await setToggle(profileRow(page, name).locator('.toggle-container'), enabled);
}

export async function addHeaderViaUi(
  page: Page,
  name: string,
  value: string,
  type: 'request' | 'response' = 'request'
): Promise<Locator> {
  await page.click('#add-header-btn');
  const row = page.locator('.header-item').last();
  await expect(row.locator('.header-name')).toBeFocused();
  if (type === 'response') {
    await row.locator('.header-type').selectOption('response');
  }
  await row.locator('.header-name').fill(name);
  await row.locator('.header-value').fill(value);
  await flushEdits(page);
  return row;
}

export async function addFilterViaUi(page: Page, value: string): Promise<Locator> {
  await page.click('#add-filter-btn');
  const row = page.locator('.filter-item').last();
  await expect(row.locator('.filter-value')).toBeFocused();
  await row.locator('.filter-value').fill(value);
  await flushEdits(page);
  return row;
}

/** Answer the popup prompt modal */
export async function answerPrompt(page: Page, value: string): Promise<void> {
  const modal = page.locator('#prompt-modal');
  await expect(modal).toBeVisible();
  await page.locator('#prompt-input').fill(value);
  await page.keyboard.press('Enter');
}

/**
 * Request headers received by the test server for a navigation to `baseUrl/headers`.
 */
export async function receivedRequestHeaders(
  probe: Page,
  baseUrl: string
): Promise<Record<string, string>> {
  const response = await probe.goto(`${baseUrl}/headers`);
  const body = JSON.parse((await response?.text()) ?? '{}');
  return body.headers ?? {};
}

export async function expectRequestHeader(
  probe: Page,
  baseUrl: string,
  name: string,
  value: string | undefined
): Promise<void> {
  await expect
    .poll(async () => (await receivedRequestHeaders(probe, baseUrl))[name.toLowerCase()], {
      message: `request header ${name} on ${baseUrl}`,
      timeout: 10000,
    })
    .toBe(value);
}

export async function receivedResponseHeaders(
  probe: Page,
  baseUrl: string
): Promise<Record<string, string>> {
  await probe.goto(`${baseUrl}/page`);
  return probe.evaluate(async () => {
    const response = await fetch('/response-headers', { cache: 'no-store' });
    return Object.fromEntries(response.headers.entries());
  });
}

export async function expectResponseHeader(
  probe: Page,
  baseUrl: string,
  name: string,
  value: string | undefined
): Promise<void> {
  await expect
    .poll(async () => (await receivedResponseHeaders(probe, baseUrl))[name.toLowerCase()], {
      message: `response header ${name} on ${baseUrl}`,
      timeout: 10000,
    })
    .toBe(value);
}

export async function readBadgeText(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const runtime = globalThis as any;
    const api = runtime.browser ?? runtime.chrome;
    const action = api.action ?? api.browserAction;
    return action.getBadgeText({});
  });
}

/** Collect uncaught page errors to assert that a flow ran without JavaScript errors */
export function trackPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
}

/** Current values of every input matched by the locator */
export function inputValues(locator: Locator): Promise<string[]> {
  return locator.evaluateAll((elements) =>
    elements.map((element) => (element as HTMLInputElement).value)
  );
}
