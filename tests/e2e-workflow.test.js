import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const rootDir = process.cwd();

test('package.json exposes Chromium and Firefox E2E workflows', () => {
  const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));

  assert.ok(packageJson.scripts['test:e2e'].includes('pnpm run package'));
  assert.ok(packageJson.scripts['test:e2e:chromium'].includes('--project=chromium'));
  assert.ok(packageJson.scripts['test:e2e:firefox'].includes('--project=firefox'));
  assert.ok(packageJson.scripts['test:firefox'].includes('scripts/test-firefox.js'));
});

test('playwright config runs every flow in Chromium and Firefox', () => {
  const config = readFileSync(join(rootDir, 'playwright.config.ts'), 'utf-8');

  assert.ok(config.includes("name: 'chromium'"));
  assert.ok(config.includes("name: 'firefox'"));
});

test('fixtures load the packaged extension for each browser', () => {
  const fixtures = readFileSync(join(rootDir, 'e2e/fixtures.ts'), 'utf-8');

  assert.ok(fixtures.includes("kind === 'chromium' ? 'chrome' : 'firefox'"));
  assert.ok(fixtures.includes('installTemporaryAddon'));
});
