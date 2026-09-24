import { filtersMatchUrl, isActiveFilter, isValidDomain, matchFilter } from './matching.js';
import type { Profile } from './types/index.js';

export { isValidDomain, matchFilter };

export function domainFromUrl(urlString: string): string | null {
  try {
    const url = new URL(urlString);
    return url.hostname;
  } catch (_e) {
    return null;
  }
}

/**
 * Pick the first enabled profile whose filters explicitly match the URL.
 * Profiles without active filters (which apply everywhere) are never auto-selected.
 */
export function selectProfileForUrl(profiles: Profile[], urlString: string): Profile | undefined {
  return profiles.find(
    (profile) =>
      profile.enabled === true &&
      (profile.filters ?? []).some(isActiveFilter) &&
      filtersMatchUrl(profile.filters, urlString)
  );
}
