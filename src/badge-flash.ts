/**
 * Short "ON" / "OFF" badge shown when the keyboard shortcut switches the header
 * modification, so that the change is visible without opening the popup. The usual badge
 * (count of applied headers) comes back afterwards.
 */

export const BADGE_FLASH_MS = 1500;
export const BADGE_FLASH_COLORS = { on: '#276749', off: '#4a5568' } as const;

export interface BadgeApi {
  setBadgeText(details: { text: string }): Promise<void> | void;
  setBadgeBackgroundColor(details: { color: string }): Promise<void> | void;
}

type Schedule = (callback: () => void, delay: number) => unknown;

let flashUntil = 0;
let flashToken = 0;

/** While a flash is shown, the regular badge updates must not overwrite it */
export function isBadgeFlashing(now = Date.now()): boolean {
  return now < flashUntil;
}

/**
 * Show the new state on the badge, then call `restore` (the regular badge update).
 * A new flash replaces the previous one: only the latest one restores the badge.
 */
export async function flashBadge(
  api: BadgeApi | undefined,
  enabled: boolean,
  restore: () => void,
  schedule: Schedule = setTimeout,
  now = Date.now()
): Promise<void> {
  if (!api) return;
  const token = ++flashToken;
  flashUntil = now + BADGE_FLASH_MS;
  await api.setBadgeText({ text: enabled ? 'ON' : 'OFF' });
  await api.setBadgeBackgroundColor({
    color: enabled ? BADGE_FLASH_COLORS.on : BADGE_FLASH_COLORS.off,
  });
  schedule(() => {
    if (token !== flashToken) return;
    flashUntil = 0;
    restore();
  }, BADGE_FLASH_MS);
}
