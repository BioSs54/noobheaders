import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { handleCommand, TOGGLE_COMMAND } from '../dist/commands.js';

function fakeStorage(initial) {
  const data = { ...initial };
  return {
    data,
    async get(keys) {
      return Object.fromEntries(keys.filter((key) => key in data).map((key) => [key, data[key]]));
    },
    async set(items) {
      Object.assign(data, items);
    },
  };
}

test('the toggle command switches the header modification on and off', async () => {
  const storage = fakeStorage({});
  assert.strictEqual(await handleCommand(TOGGLE_COMMAND, storage), true);
  assert.strictEqual(storage.data.noobheaders_global_enabled, true, 'missing value means off');
  await handleCommand(TOGGLE_COMMAND, storage);
  assert.strictEqual(storage.data.noobheaders_global_enabled, false);
});

test('the new state is reported before it is written', async () => {
  const storage = fakeStorage({ noobheaders_global_enabled: true });
  const seen = [];
  await handleCommand(TOGGLE_COMMAND, storage, (enabled) => {
    seen.push([enabled, storage.data.noobheaders_global_enabled]);
  });
  assert.deepStrictEqual(seen, [[false, true]], 'called with the new state, before the write');
  assert.strictEqual(storage.data.noobheaders_global_enabled, false);
});

test('unknown commands are ignored', async () => {
  const storage = fakeStorage({ noobheaders_global_enabled: true });
  assert.strictEqual(await handleCommand('something-else', storage), false);
  assert.strictEqual(storage.data.noobheaders_global_enabled, true);
});

test('every manifest declares the toggle command with a translated description', () => {
  const english = JSON.parse(readFileSync('_locales/en/messages.json', 'utf-8'));
  for (const file of ['manifest.json', 'manifest.chrome.json', 'manifest.firefox.json']) {
    const manifest = JSON.parse(readFileSync(file, 'utf-8'));
    const command = manifest.commands?.[TOGGLE_COMMAND];
    assert.ok(command, `${file} declares the command`);
    assert.strictEqual(command.suggested_key.default, 'Alt+Shift+H');
    const key = command.description.replace(/^__MSG_(.+)__$/, '$1');
    assert.ok(english[key], `${file}: ${key} is translated`);
  }
});
