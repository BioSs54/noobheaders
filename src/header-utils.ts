import type { Filter, Header, Profile } from './types/index.js';

import { matchFilter } from './auto-switch.js';

export function headerAppliesToUrl(
  profile: Profile,
  header: Header,
  url: string | undefined
): boolean {
  if (!header.enabled) return false;
  if (!url) return true; // conservative: if no URL, assume applies

  const activeFilters = profile.filters?.filter((f) => f.enabled && f.value) ?? [];
  if (activeFilters.length === 0) return true;

  for (const f of activeFilters) {
    if (matchFilter(url, f)) return true;
  }

  return false;
}

export function countApplicableHeadersForUrl(profiles: Profile[], url: string | undefined): number {
  let count = 0;
  for (const p of profiles) {
    for (const h of p.headers ?? []) {
      if (headerAppliesToUrl(p, h, url)) count++;
    }
  }
  return count;
}
