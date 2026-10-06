import assert from 'node:assert';
import { test } from 'node:test';
import {
  BADGE_FLASH_COLORS,
  BADGE_FLASH_MS,
  flashBadge,
  isBadgeFlashing,
} from '../dist/badge-flash.js';

function fakeApi() {
  const calls = [];
  return {
    calls,
    setBadgeText: async (details) => calls.push(['text', details.text]),
    setBadgeBackgroundColor: async (details) => calls.push(['color', details.color]),
  };
}

function manualSchedule() {
  const pending = [];
  const schedule = (callback, delay) => pending.push({ callback, delay });
  return { pending, schedule };
}

test('the shortcut shows ON or OFF on the badge, then restores it', async () => {
  const api = fakeApi();
  const { pending, schedule } = manualSchedule();
  let restored = 0;

  await flashBadge(api, true, () => restored++, schedule, 1000);
  assert.deepStrictEqual(api.calls, [
    ['text', 'ON'],
    ['color', BADGE_FLASH_COLORS.on],
  ]);
  assert.strictEqual(isBadgeFlashing(1000 + BADGE_FLASH_MS - 1), true);
  assert.strictEqual(pending[0].delay, BADGE_FLASH_MS);

  pending[0].callback();
  assert.strictEqual(restored, 1);
  assert.strictEqual(isBadgeFlashing(1001), false, 'the regular badge updates resume');

  await flashBadge(api, false, () => restored++, schedule, 5000);
  assert.deepStrictEqual(api.calls.slice(2), [
    ['text', 'OFF'],
    ['color', BADGE_FLASH_COLORS.off],
  ]);
  pending[1].callback();
  assert.strictEqual(restored, 2);
});

test('a new flash replaces the previous one', async () => {
  const api = fakeApi();
  const { pending, schedule } = manualSchedule();
  let restored = 0;

  await flashBadge(api, true, () => restored++, schedule, 1000);
  await flashBadge(api, false, () => restored++, schedule, 1500);

  // The first timer must not end the second flash early
  pending[0].callback();
  assert.strictEqual(restored, 0);
  assert.strictEqual(isBadgeFlashing(1600), true);

  pending[1].callback();
  assert.strictEqual(restored, 1);
  assert.strictEqual(isBadgeFlashing(1600), false);
});

test('nothing happens without a badge API', async () => {
  const { pending, schedule } = manualSchedule();
  await flashBadge(undefined, true, () => assert.fail('no restore'), schedule, 1000);
  assert.strictEqual(pending.length, 0);
  assert.strictEqual(isBadgeFlashing(1000), false);
});
