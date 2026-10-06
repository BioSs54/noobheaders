/**
 * Keyboard shortcuts (manifest "commands")
 */

import { STORAGE_KEYS } from './types/index.js';

export const TOGGLE_COMMAND = 'toggle-header-modification';

interface LocalStorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/**
 * Run a command. Switching the header modification only writes the storage: the background
 * storage listener then applies the rules and refreshes the badge (and an open popup).
 * Returns whether the command was handled.
 */
export async function handleCommand(command: string, storage: LocalStorageArea): Promise<boolean> {
  if (command !== TOGGLE_COMMAND) return false;
  const data = await storage.get([STORAGE_KEYS.GLOBAL_ENABLED]);
  await storage.set({ [STORAGE_KEYS.GLOBAL_ENABLED]: !data[STORAGE_KEYS.GLOBAL_ENABLED] });
  return true;
}
