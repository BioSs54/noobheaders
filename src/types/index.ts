/**
 * NoobHeaders - Type Definitions
 * Provides type safety for all data structures
 */

/**
 * HTTP Header modification entry
 */
export interface Header {
  /** Whether this header is active */
  enabled: boolean;
  /** Header type: request or response */
  type: 'request' | 'response';
  /** Header name (e.g., User-Agent, X-Custom-Header) */
  name: string;
  /** Header value. Empty string to remove header */
  value: string;
}

/**
 * URL/Domain filter for targeting specific websites
 */
export interface Filter {
  /** Whether this filter is active */
  enabled: boolean;
  /** Filter type: url pattern or domain */
  type: 'url' | 'domain';
  /** Filter value (e.g., *://github.com/*, example.com) */
  value: string;
}

/**
 * Profile containing headers and filters
 */
export interface Profile {
  /** Unique profile identifier */
  id: string;
  /** Human-readable profile name */
  name: string;
  /** Whether this profile is enabled (contributes rules when global enabled) */
  enabled?: boolean;
  /** List of header modifications */
  headers: Header[];
  /** List of URL/domain filters */
  filters: Filter[];
}

const BUILT_IN_DEMO_PROFILE_NAMES = new Set(['httpbin.org Demo', 'Example.com Demo']);

function repairBuiltInDemoProfile(profile: Profile): Profile {
  if (!BUILT_IN_DEMO_PROFILE_NAMES.has(profile.name)) {
    return profile;
  }

  const hasUsableHeader = profile.headers.some(
    (header) => header.enabled && header.name.trim().length > 0
  );
  const hasUsableFilter = profile.filters.some(
    (filter) => filter.enabled && filter.value.trim().length > 0
  );

  if (hasUsableHeader && hasUsableFilter) {
    return profile;
  }

  const repaired = createDefaultProfile(profile.id);
  return {
    ...repaired,
    enabled: profile.enabled === true,
  };
}

export function normalizeHeader(header: Partial<Header>): Header {
  return {
    enabled: header.enabled !== false,
    type: header.type === 'response' ? 'response' : 'request',
    name: typeof header.name === 'string' ? header.name : '',
    value: typeof header.value === 'string' ? header.value : '',
  };
}

export function normalizeFilter(filter: Partial<Filter>): Filter {
  return {
    enabled: filter.enabled !== false,
    type: filter.type === 'domain' ? 'domain' : 'url',
    value: typeof filter.value === 'string' ? filter.value : '',
  };
}

export function normalizeProfile(profile: Partial<Profile>): Profile {
  const normalizedProfile = {
    id: typeof profile.id === 'string' ? profile.id : `${Date.now()}`,
    name: typeof profile.name === 'string' ? profile.name : 'Unnamed Profile',
    enabled: profile.enabled === true,
    headers: Array.isArray(profile.headers) ? profile.headers.map(normalizeHeader) : [],
    filters: Array.isArray(profile.filters) ? profile.filters.map(normalizeFilter) : [],
  };

  return repairBuiltInDemoProfile(normalizedProfile);
}

export function normalizeProfiles(profiles: unknown): Profile[] {
  if (!Array.isArray(profiles)) {
    return [];
  }

  return profiles.map((profile) => normalizeProfile((profile || {}) as Partial<Profile>));
}

export function createDefaultProfile(id: string): Profile {
  return {
    id,
    name: 'httpbin.org Demo',
    enabled: false,
    headers: [
      {
        enabled: true,
        type: 'request',
        name: 'X-NoobHeaders-Demo',
        value: 'request-httpbin-demo',
      },
      {
        enabled: true,
        type: 'response',
        name: 'X-NoobHeaders-Response',
        value: 'response-httpbin-demo',
      },
    ],
    filters: [
      {
        enabled: true,
        type: 'url',
        value: '*://httpbin.org/headers*',
      },
    ],
  };
}

/**
 * Chrome Storage data structure
 */
export interface StorageData {
  /** All user profiles */
  noobheaders_profiles: Profile[];
  /** Currently active profile ID */
  noobheaders_active_profile: string;
  /** Global enable/disable state */
  noobheaders_global_enabled: boolean;
}

/**
 * Storage keys constants
 */
export const STORAGE_KEYS = {
  PROFILES: 'noobheaders_profiles',
  ACTIVE_PROFILE: 'noobheaders_active_profile',
  GLOBAL_ENABLED: 'noobheaders_global_enabled',
} as const;

/**
 * DeclarativeNetRequest rule action for header modification
 */
export interface HeaderAction {
  header: string;
  operation: 'set' | 'remove';
  value?: string;
}

/**
 * Simplified rule structure for our use case
 */
export interface ModifyHeaderRule {
  id: number;
  priority: number;
  action: {
    type: 'modifyHeaders';
    requestHeaders?: HeaderAction[];
    responseHeaders?: HeaderAction[];
  };
  condition: {
    urlFilter: string;
    initiatorDomains?: string[];
    resourceTypes: chrome.declarativeNetRequest.ResourceType[];
  };
}
