/**
 * Shared matching and validation helpers.
 *
 * Every consumer (Chrome declarativeNetRequest rules, Firefox webRequest listeners,
 * badge counter and auto-switch) relies on these helpers so that a filter behaves
 * the same way in every browser.
 */
import type { Filter, Header } from './types/index.js';

/** RFC 7230 token characters allowed in a header name. */
const HEADER_NAME_RE = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
/** Header values must not contain CR, LF or NUL characters. */
const HEADER_VALUE_RE = /^[^\r\n\0]*$/;
const HOSTNAME_RE = /^[a-z0-9_]+([-a-z0-9_]*[a-z0-9_]+)?(\.[a-z0-9_]+([-a-z0-9_]*[a-z0-9_]+)?)*$/;
const SCHEME_WILDCARD = '[a-z][a-z0-9+.-]*';

export function isValidHeaderName(name: string): boolean {
  return typeof name === 'string' && HEADER_NAME_RE.test(name.trim());
}

export function isValidHeaderValue(value: string): boolean {
  return typeof value === 'string' && HEADER_VALUE_RE.test(value);
}

/**
 * A header produces a rule only when it is enabled and both its name and value are valid.
 */
export function isUsableHeader(header: Header): boolean {
  return (
    header.enabled === true && isValidHeaderName(header.name) && isValidHeaderValue(header.value)
  );
}

/**
 * Normalise a domain filter value into a lowercase, punycode hostname.
 * Accepts `example.com`, `*.example.com`, `EXAMPLE.com.` and full URLs.
 * Returns null when the value cannot be used as a domain (e.g. it contains a port).
 */
export function normalizeDomainValue(value: string): string | null {
  if (!value || typeof value !== 'string') return null;
  let v = value.trim().toLowerCase();
  if (v.length === 0) return null;

  if (v.includes('://')) {
    try {
      v = new URL(v).hostname;
    } catch {
      return null;
    }
  } else if (v.includes('/')) {
    v = v.slice(0, v.indexOf('/'));
  }

  if (v.startsWith('*.')) v = v.slice(2);
  if (v.endsWith('.')) v = v.slice(0, -1);
  if (v.length === 0 || v.includes(':') || v.includes('*')) return null;

  let host: string;
  try {
    host = new URL(`http://${v}`).hostname;
  } catch {
    return null;
  }

  return HOSTNAME_RE.test(host) ? host : null;
}

export function isValidDomain(value: string): boolean {
  return normalizeDomainValue(value) !== null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function globToRegex(value: string, wildcard: string): string {
  return value
    .split('*')
    .map((part) => escapeRegex(part))
    .join(wildcard);
}

/**
 * Convert a user URL pattern into a regular expression source that is compatible with
 * both JavaScript RegExp and RE2 (used by declarativeNetRequest `regexFilter`).
 *
 * Rules:
 * - `*` matches any sequence of characters.
 * - Without a scheme (`example.com/api/*`) any scheme matches.
 * - A host starting with `*.` also matches the bare domain (`*://*.example.com/*`
 *   matches `https://example.com/`).
 * - Without a path (`*://example.com`, `localhost:3000`) every path on that host matches.
 * - The pattern must match the whole URL.
 */
export function urlPatternToRegexSource(pattern: string): string | null {
  if (!pattern || typeof pattern !== 'string') return null;
  const p = pattern.trim();
  if (p.length === 0) return null;

  let scheme = '*';
  let rest = p;
  const schemeIndex = p.indexOf('://');
  if (schemeIndex !== -1) {
    scheme = p.slice(0, schemeIndex) || '*';
    rest = p.slice(schemeIndex + 3);
  }

  const pathIndex = rest.search(/[/?#]/);
  const host = pathIndex === -1 ? rest : rest.slice(0, pathIndex);
  const path = pathIndex === -1 ? '' : rest.slice(pathIndex);

  const schemeRe = scheme === '*' ? SCHEME_WILDCARD : globToRegex(scheme.toLowerCase(), '[^:/]*');

  let hostRe: string;
  if (host === '' || host === '*') {
    hostRe = '[^/?#]*';
  } else if (host.startsWith('*.')) {
    hostRe = `(?:[^/?#]*\\.)?${globToRegex(host.slice(2).toLowerCase(), '[^/?#]*')}`;
  } else {
    hostRe = globToRegex(host.toLowerCase(), '[^/?#]*');
  }

  const pathRe = path === '' ? '(?:[/?#].*)?' : globToRegex(path, '.*');

  return `^${schemeRe}://${hostRe}${pathRe}$`;
}

/**
 * A filter is "active" when enabled with a non-empty value. Active filters restrict
 * where headers apply, even when they are invalid (an invalid filter matches nothing).
 */
export function isActiveFilter(filter: Filter): boolean {
  return filter.enabled === true && typeof filter.value === 'string' && filter.value.trim() !== '';
}

export function isValidFilter(filter: Filter): boolean {
  if (filter.type === 'domain') return normalizeDomainValue(filter.value) !== null;
  return urlPatternToRegexSource(filter.value) !== null;
}

export function matchFilter(urlString: string, filter: Filter): boolean {
  if (!filter || !isActiveFilter(filter)) return false;

  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return false;
  }

  if (filter.type === 'domain') {
    const domain = normalizeDomainValue(filter.value);
    if (!domain) return false;
    const host = url.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }

  const source = urlPatternToRegexSource(filter.value);
  if (!source) return false;
  try {
    return new RegExp(source, 'i').test(url.href);
  } catch {
    return false;
  }
}

/**
 * Whether the headers of a profile with the given filters apply to a URL.
 * No active filter means "everywhere"; otherwise at least one filter must match.
 */
export function filtersMatchUrl(filters: Filter[] | undefined, url: string | undefined): boolean {
  const activeFilters = (filters ?? []).filter(isActiveFilter);
  if (activeFilters.length === 0) return true;
  if (!url) return false;
  return activeFilters.some((filter) => matchFilter(url, filter));
}
