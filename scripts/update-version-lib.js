import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function updateVersionInDir(rootDir, newVersion) {
  // Update any manifest*.json files (support manifest.json, manifest.chrome.json, manifest.firefox.json, ...)
  const manifestFiles = readdirSync(rootDir).filter((f) => /^manifest.*\.json$/i.test(f));
  for (const file of manifestFiles) {
    const manifestPath = join(rootDir, file);
    try {
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
      if (manifest && typeof manifest === 'object') {
        manifest.version = newVersion;
        writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
      }
    } catch (e) {
      // ignore files that are not valid JSON
    }
  }

  // Update top-level HTML files
  const versionRegex = /v\d+\.\d+\.\d+/g;
  const htmlFiles = readdirSync(rootDir).filter((f) => f.endsWith('.html'));
  for (const file of htmlFiles) {
    const filePath = join(rootDir, file);
    const content = readFileSync(filePath, 'utf-8');
    if (versionRegex.test(content)) {
      const updated = content.replace(versionRegex, `v${newVersion}`);
      writeFileSync(filePath, updated);
    }
  }
}

export default updateVersionInDir;
