import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const rootDir = process.cwd();

test('package.json exposes explicit Chromium and Firefox test workflows', () => {
  const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'));

  assert.ok(packageJson.scripts['test:e2e'].includes('--project=chromium'));
  assert.ok(packageJson.scripts['test:e2e'].includes('pnpm run package'));
  assert.ok(packageJson.scripts['test:e2e:chromium'].includes('--project=chromium'));
  assert.ok(packageJson.scripts['test:firefox'].includes('scripts/test-firefox.js'));
});

test('playwright config keeps automatic E2E coverage on Chromium only', () => {
  const config = readFileSync(join(rootDir, 'playwright.config.ts'), 'utf-8');

  assert.ok(config.includes("testIgnore: ['**/firefox-debug.spec.ts']"));
  assert.ok(config.includes("name: 'chromium'"));
  assert.ok(!config.includes("name: 'firefox'"));
});

test('fixtures resolve Chromium tests to the packaged chrome directory', () => {
  const fixtures = readFileSync(join(rootDir, 'e2e/fixtures.ts'), 'utf-8');

  assert.ok(
    fixtures.includes("const packageDir = projectName === 'chromium' ? 'chrome' : projectName;")
  );
});

test('firefox debug spec is explicitly marked as skipped reference coverage', () => {
  const spec = readFileSync(join(rootDir, 'e2e/firefox-debug.spec.ts'), 'utf-8');

  assert.ok(spec.includes('Use `pnpm test:firefox` for the supported manual workflow'));
  assert.ok(spec.includes('test.describe.skip('));
});
