import {
  isActiveFilter,
  isUsableHeader,
  normalizeDomainValue,
  urlPatternToRegexSource,
} from './matching.js';
import type { Filter, Header, ModifyHeaderRule, Profile } from './types/index.js';

const DEFAULT_URL_FILTER = '*://*/*';

const RESOURCE_TYPES: chrome.declarativeNetRequest.ResourceType[] = [
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
] as chrome.declarativeNetRequest.ResourceType[];

/**
 * Profiles contributing headers: every enabled profile. The selected profile is placed
 * last so that it gets the highest priority when several profiles set the same header.
 */
export function resolveProfilesToApply(
  profiles: Profile[],
  activeProfileId?: string | null
): Profile[] {
  const enabledProfiles = profiles.filter((profile) => profile.enabled === true);
  const others = enabledProfiles.filter((profile) => profile.id !== activeProfileId);
  const active = enabledProfiles.find((profile) => profile.id === activeProfileId);

  return active ? [...others, active] : others;
}

type RuleCondition = ModifyHeaderRule['condition'];

/**
 * Build the list of DNR conditions for a set of filters.
 * Filters are OR-ed: one condition per URL pattern plus one condition for all domains.
 * Returns an empty list when filters are active but none of them is valid, so that an
 * invalid filter never widens the scope to every URL.
 */
export function buildConditions(filters: Filter[] | undefined): RuleCondition[] {
  const activeFilters = (filters ?? []).filter(isActiveFilter);

  if (activeFilters.length === 0) {
    return [{ urlFilter: DEFAULT_URL_FILTER, resourceTypes: RESOURCE_TYPES }];
  }

  const conditions: RuleCondition[] = [];
  const domains = new Set<string>();
  const regexes = new Set<string>();

  for (const filter of activeFilters) {
    if (filter.type === 'domain') {
      const domain = normalizeDomainValue(filter.value);
      if (domain) domains.add(domain);
    } else {
      const regex = urlPatternToRegexSource(filter.value);
      if (regex) regexes.add(regex);
    }
  }

  for (const regexFilter of regexes) {
    conditions.push({
      regexFilter,
      isUrlFilterCaseSensitive: false,
      resourceTypes: RESOURCE_TYPES,
    });
  }

  if (domains.size > 0) {
    conditions.push({ requestDomains: [...domains], resourceTypes: RESOURCE_TYPES });
  }

  return conditions;
}

export function convertProfileToRules(
  profile: { headers?: Header[]; filters?: Filter[] },
  globalEnabled: boolean,
  ruleIdOffset = 1,
  priority = 1
): ModifyHeaderRule[] {
  const rules: ModifyHeaderRule[] = [];

  if (!globalEnabled || !profile.headers || profile.headers.length === 0) {
    return rules;
  }

  const conditions = buildConditions(profile.filters);
  let ruleId = ruleIdOffset;

  for (const header of profile.headers) {
    if (!isUsableHeader(header)) continue;

    const name = header.name.trim();
    const headerObj = header.value
      ? { header: name, operation: 'set' as const, value: header.value }
      : { header: name, operation: 'remove' as const };

    const action: ModifyHeaderRule['action'] = { type: 'modifyHeaders' };
    if (header.type === 'request') action.requestHeaders = [headerObj];
    else action.responseHeaders = [headerObj];

    for (const condition of conditions) {
      rules.push({
        id: ruleId++,
        priority,
        action,
        condition,
      });
    }
  }

  return rules;
}

export default { convertProfileToRules };
