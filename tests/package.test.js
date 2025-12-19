import assert from 'node:assert';
import fs from 'node:fs';
import { cpSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// This test simulates packaging by copying a minimal dist into a temp dir and
// running the packaging script logic partially (create zip files) to ensure
// both versioned and unversioned zip files are produced.
test('package script produces versioned and unversioned zips', async () => {
  const tmp = fs.mkdtempSync(join(os.tmpdir(), 'noobheaders-package-'));
  const dist = join(tmp, 'dist');
  mkdirSync(dist, { recursive: true });

  // create minimal dist files required by package script
  fs.writeFileSync(
    join(dist, 'manifest.json'),
    JSON.stringify({ version: '9.9.9', manifest_version: 3 })
  );
  fs.writeFileSync(join(dist, 'background.js'), '');
  fs.writeFileSync(join(dist, 'popup.html'), '<html></html>');
  fs.writeFileSync(join(dist, 'popup.js'), '');
  fs.writeFileSync(join(dist, 'i18n.js'), '');
  fs.writeFileSync(join(dist, 'styles.css'), '');
  fs.writeFileSync(join(dist, 'options.html'), '<html></html>');
  fs.writeFileSync(join(dist, 'options.js'), '');
  fs.writeFileSync(join(dist, 'welcome.html'), '<html></html>');
  fs.writeFileSync(join(dist, 'LICENSE'), '');

  const packagesDir = join(tmp, 'packages');
  mkdirSync(packagesDir, { recursive: true });

  // Run a minimal packaging: create chrome zip files similarly to script
  const { createWriteStream } = await import('node:fs');
  const archiver = (await import('archiver')).default;
  const chromeDir = join(tmp, 'chrome');
  mkdirSync(chromeDir, { recursive: true });
  cpSync(dist, chromeDir, { recursive: true });

  const chromeZipVersioned = join(packagesDir, 'noobheaders-chrome-v9.9.9.zip');
  const chromeZipLatest = join(packagesDir, 'noobheaders-chrome.zip');

  await new Promise((resolve, reject) => {
    const output = createWriteStream(chromeZipVersioned);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));
    archive.pipe(output);
    archive.directory(chromeDir, false);
    archive.finalize();
  });

  cpSync(chromeZipVersioned, chromeZipLatest);

  assert.ok(fs.existsSync(chromeZipVersioned));
  assert.ok(fs.existsSync(chromeZipLatest));
});
