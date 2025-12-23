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
