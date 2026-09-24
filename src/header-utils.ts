import { filtersMatchUrl, isUsableHeader } from './matching.js';
import type { Header, Profile } from './types/index.js';

export function headerAppliesToUrl(
  profile: Profile,
  header: Header,
  url: string | undefined
): boolean {
  if (!isUsableHeader(header)) return false;
  return filtersMatchUrl(profile.filters, url);
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
