import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

test('manifest.json exists and is valid JSON', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifestContent = readFileSync(manifestPath, 'utf-8');

  assert.doesNotThrow(() => {
    JSON.parse(manifestContent);
  }, 'manifest.json should be valid JSON');
});

test('manifest.json has required fields', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  assert.strictEqual(manifest.manifest_version, 3, 'Should use manifest v3');
  assert.ok(manifest.name, 'Should have a name');
  assert.ok(manifest.version, 'Should have a version');
  assert.ok(manifest.description, 'Should have a description');
});

test('manifest.json version follows semver', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  const semverRegex = /^\d+\.\d+\.\d+$/;
  assert.ok(
    semverRegex.test(manifest.version),
    `Version ${manifest.version} should follow semver format`
  );
});

test('manifest.json has required permissions', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  assert.ok(manifest.permissions, 'Should have permissions');
  assert.ok(manifest.permissions.includes('storage'), 'Should have storage permission');
  assert.ok(
    manifest.permissions.includes('declarativeNetRequest'),
    'Should have declarativeNetRequest permission'
  );
});

test('manifest.json has background service worker', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  assert.ok(manifest.background, 'Should have background field');
  assert.strictEqual(
    manifest.background.service_worker,
    'background.js',
    'Should specify background.js as service worker'
  );
});

test('manifest.json has action popup', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  assert.ok(manifest.action, 'Should have action field');
  assert.strictEqual(manifest.action.default_popup, 'popup.html', 'Should specify popup.html');
});

test('manifest.json has icons', () => {
  const manifestPath = join(rootDir, 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

  assert.ok(manifest.icons, 'Should have icons field');
  assert.ok(manifest.icons['16'], 'Should have 16x16 icon');
  assert.ok(manifest.icons['48'], 'Should have 48x48 icon');
  assert.ok(manifest.icons['128'], 'Should have 128x128 icon');
});

console.log('✅ All manifest tests passed');
