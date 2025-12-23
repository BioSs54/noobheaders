import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const manifests = ['manifest.json', 'manifest.chrome.json', 'manifest.firefox.json'];

test('manifests exist and are valid JSON', () => {
  for (const name of manifests) {
    const manifestPath = join(rootDir, name);
    const manifestContent = readFileSync(manifestPath, 'utf-8');
    assert.doesNotThrow(() => {
      JSON.parse(manifestContent);
    }, `${name} should be valid JSON`);
  }
});

test('manifests have required fields', () => {
  for (const name of manifests) {
    const manifestPath = join(rootDir, name);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));

    if (name === 'manifest.firefox.json') {
      // Firefox uses manifest v2
      assert.strictEqual(manifest.manifest_version, 2, `${name} should use manifest v2`);
    } else {
      assert.strictEqual(manifest.manifest_version, 3, `${name} should use manifest v3`);
    }
    assert.ok(manifest.name, `${name} should have a name`);
    assert.ok(manifest.version, `${name} should have a version`);
    assert.ok(manifest.description, `${name} should have a description`);

    // Version semver
    const semverRegex = /^\d+\.\d+\.\d+$/;
    assert.ok(
      semverRegex.test(manifest.version),
      `${name} version ${manifest.version} should follow semver format`
    );

    // Permissions
    assert.ok(manifest.permissions, `${name} should have permissions`);
    assert.ok(manifest.permissions.includes('storage'), `${name} should have storage permission`);
    if (name !== 'manifest.firefox.json') {
      assert.ok(
        manifest.permissions.includes('declarativeNetRequest'),
        `${name} should have declarativeNetRequest permission`
      );
    }

    // Background handling
    if (manifest.background) {
      if (manifest.manifest_version === 3) {
        // manifest v3 should use service worker
        assert.strictEqual(
          manifest.background.service_worker,
          'background.js',
          `${name} should specify background.js as service worker`
        );
      } else {
        // manifest v2 (Firefox) should have either background.scripts or background.page
        assert.ok(
          manifest.background.scripts || manifest.background.page,
          `${name} should have background scripts or background page for manifest v2`
        );
      }
    }

    // Action or browser_action popup
    if (manifest.action) {
      assert.strictEqual(
        manifest.action.default_popup,
        'popup.html',
        `${name} should specify popup.html`
      );
    } else {
      // older Firefox manifests may use browser_action
      assert.ok(
        manifest.browser_action && manifest.browser_action.default_popup === 'popup.html',
        `${name} should specify popup.html via action or browser_action`
      );
    }

    // Icons
    assert.ok(manifest.icons, `${name} should have icons field`);
    assert.ok(manifest.icons['16'], `${name} should have 16x16 icon`);
    assert.ok(manifest.icons['48'], `${name} should have 48x48 icon`);
    assert.ok(manifest.icons['128'], `${name} should have 128x128 icon`);
  }
});

console.log('✅ All manifest tests passed');

console.log('✅ All manifest tests passed');
