let selectedIndex: number | null = null;

export function selectFilter(index: number | null): void {
  selectedIndex = index;
}

export function getSelectedFilter(): number | null {
  return selectedIndex;
}

export function clearSelection(): void {
  selectedIndex = null;
}

export default { selectFilter, getSelectedFilter, clearSelection };
