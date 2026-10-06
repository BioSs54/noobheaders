/**
 * Helpers for filter UI and heuristic detection
 */
export type FilterType = 'url' | 'domain';

/**
 * Heuristically detect whether a value should be treated as a URL pattern or a domain
 * - contains '*', '://', a port or a slash after hostname -> url
 * - otherwise domain
 */
export function detectFilterType(value: string): FilterType {
  if (!value || typeof value !== 'string') return 'url';
  const v = value.trim();
  // Leading wildcard like "*.example.com" should be considered a domain
  if (v.includes('://') || v.includes('/')) return 'url';
  // A port (localhost:3000) cannot be expressed as a domain filter
  if (v.includes(':')) return 'url';
  if (v.startsWith('*.')) return 'domain';
  if (v.includes('*')) return 'url';
  return 'domain';
}

/**
 * Whether a filter value looks like a regular expression (as in ModHeader), while
 * NoobHeaders patterns use "*" as wildcard: ".*" after "/" only matches a literal dot.
 * "example.*" stays allowed: there, "*" after a dot is a valid wildcard (any extension).
 */
export function looksLikeRegex(value: string): boolean {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  return (
    v.includes('\\') ||
    v.startsWith('^') ||
    v.endsWith('$') ||
    v.includes('.+') ||
    v.includes('(?') ||
    /(^|[^a-z0-9])\.\*/i.test(v)
  );
}

export default { detectFilterType, looksLikeRegex };
