import type { Filter, Profile } from './types/index.js';

export function domainFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (e) {
    return null;
  }
}

export function matchFilter(urlString: string, filter: Filter): boolean {
  const domain = domainFromUrl(urlString);
  if (!domain) return false;

  if (!filter || !filter.value) return false;

  if (filter.type === 'domain') {
    // Normalise input and hostname for tolerant matching
    const host = domain.toLowerCase().trim();
    let value = filter.value.toLowerCase().trim();

    // If user pasted a full URL as domain, extract hostname
    if (value.includes('/')) {
      try {
        const u = new URL(value);
        value = u.hostname;
      } catch (e) {
        // leave as-is
      }
    }

    // Support leading wildcard like *.example.com
    if (value.startsWith('*.')) {
      value = value.substring(2);
    }

    return host === value || host.endsWith(`.${value}`);
  }

  // url pattern support: convert simple wildcard patterns to RegExp
  // e.g. *://github.com/* -> ^.*://github\.com/.*$
  const pattern = filter.value.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  try {
    const re = new RegExp(`^${pattern}$`);
    return re.test(urlString);
  } catch (e) {
    return false;
  }
}

export function selectProfileForUrl(profiles: Profile[], urlString: string): Profile | undefined {
  for (const profile of profiles) {
    if (!profile.filters || profile.filters.length === 0) continue;
    const activeFilters = profile.filters.filter((f) => f.enabled && f.value);
    for (const f of activeFilters) {
      if (matchFilter(urlString, f)) return profile;
    }
  }
  return undefined;
}

/**
 * Validate whether a given string is acceptable as a domain filter.
 * Accepts hostnames (example.com), leading wildcard (*.example.com), and full URLs.
 */
export function isValidDomain(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (v.length === 0) return false;

  // If it looks like a URL, try to extract hostname
  if (v.includes('/') || v.startsWith('http://') || v.startsWith('https://')) {
    try {
      const u = new URL(v);
      return !!u.hostname;
    } catch (e) {
      return false;
    }
  }

  let toCheck = v.toLowerCase();
  if (toCheck.startsWith('*.')) toCheck = toCheck.substring(2);

  // simple hostname validation: labels with letters/numbers/hyphens separated by dots
  const hostRegex = /^[a-z0-9]+([\-a-z0-9]*[a-z0-9]+)?(\.[a-z0-9]+([\-a-z0-9]*[a-z0-9]+)?)*$/i;
  return hostRegex.test(toCheck);
}
