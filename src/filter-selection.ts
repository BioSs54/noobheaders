const selectedIndexes = new Map<string, number>();

function getScopeKey(profileId: string | null | undefined): string {
  return profileId ?? '__default__';
}

export function selectFilter(profileId: string | null, index: number | null): void {
  const scopeKey = getScopeKey(profileId);

  if (index === null) {
    selectedIndexes.delete(scopeKey);
    return;
  }

  selectedIndexes.set(scopeKey, index);
}

export function getSelectedFilter(profileId: string | null): number | null {
  return selectedIndexes.get(getScopeKey(profileId)) ?? null;
}

export function clearSelection(profileId?: string | null): void {
  if (typeof profileId === 'undefined') {
    selectedIndexes.clear();
    return;
  }

  selectedIndexes.delete(getScopeKey(profileId));
}

export default { selectFilter, getSelectedFilter, clearSelection };
