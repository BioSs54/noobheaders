import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function updateVersionInDir(rootDir, newVersion) {
  // Update manifest.json if present
  const manifestPath = join(rootDir, 'manifest.json');
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
    manifest.version = newVersion;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  } catch (e) {
    // ignore if manifest doesn't exist
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
