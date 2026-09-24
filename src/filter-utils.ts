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

export default { detectFilterType };
