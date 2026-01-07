import type { Filter, Header, ModifyHeaderRule } from './types/index.js';

const DEFAULT_URL_FILTER = '*://*/*';

export function convertProfileToRules(
  profile: { headers?: Header[]; filters?: Filter[] },
  globalEnabled: boolean,
  ruleIdOffset = 1
): ModifyHeaderRule[] {
  const rules: ModifyHeaderRule[] = [];

  if (!globalEnabled || !profile.headers || profile.headers.length === 0) {
    return rules;
  }

  let ruleId = ruleIdOffset;

  profile.headers.forEach((header) => {
    if (!header.enabled || !header.name) return;

    const headerObj = {
      header: header.name,
      operation: header.value ? 'set' : 'remove',
      ...(header.value ? { value: header.value } : {}),
    } as const;

    const action: ModifyHeaderRule['action'] = { type: 'modifyHeaders' } as any;
    if (header.type === 'request') action.requestHeaders = [headerObj];
    else action.responseHeaders = [headerObj];

    const activeFilters = profile.filters?.filter((f) => f.enabled && f.value) ?? [];

    const urlFilters = activeFilters.filter((f) => f.type === 'url');
    const domainFilters = activeFilters.filter((f) => f.type === 'domain');

    // Use requestDomains to filter by destination domain, not initiatorDomains
    const requestDomains = domainFilters.length > 0 ? domainFilters.map((f) => f.value) : undefined;

    if (urlFilters.length > 0) {
      urlFilters.forEach((uf) => {
        const condition: ModifyHeaderRule['condition'] = {
          urlFilter: uf.value,
          resourceTypes: [
            'main_frame',
            'sub_frame',
            'stylesheet',
            'script',
            'image',
            'font',
            'object',
            'xmlhttprequest',
            'ping',
            'csp_report',
            'media',
            'websocket',
            'other',
          ],
        } as any;

        if (requestDomains) condition.requestDomains = requestDomains;

        rules.push({ id: ruleId++, priority: 1, action, condition });
      });
    } else {
      const condition: ModifyHeaderRule['condition'] = {
        urlFilter: DEFAULT_URL_FILTER,
        resourceTypes: [
          'main_frame',
          'sub_frame',
          'stylesheet',
          'script',
          'image',
          'font',
          'object',
          'xmlhttprequest',
          'ping',
          'csp_report',
          'media',
          'websocket',
          'other',
        ],
      } as any;

      if (requestDomains) condition.requestDomains = requestDomains;

      rules.push({ id: ruleId++, priority: 1, action, condition });
    }
  });

  return rules;
}

export default { convertProfileToRules };
