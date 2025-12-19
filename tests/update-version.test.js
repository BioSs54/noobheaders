import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { updateVersionInDir } from '../scripts/update-version-lib.js';

test('updateVersionInDir updates manifest and html version strings', () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'noobheaders-test-'));

  // Create sample manifest
  const manifest = { manifest_version: 3, version: '1.0.0' };
  fs.writeFileSync(join(tmp, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  // Create sample HTML file with version string
  const html = '<!doctype html><html><body>Version v1.0.0</body></html>';
  fs.writeFileSync(join(tmp, 'sample.html'), html);

  updateVersionInDir(tmp, '2.3.4');

  const updatedManifest = JSON.parse(fs.readFileSync(join(tmp, 'manifest.json'), 'utf-8'));
  assert.strictEqual(updatedManifest.version, '2.3.4');

  const updatedHtml = fs.readFileSync(join(tmp, 'sample.html'), 'utf-8');
  assert.ok(updatedHtml.includes('v2.3.4'));
});
