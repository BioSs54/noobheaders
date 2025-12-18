import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const args = process.argv.slice(2);
const newVersion = args[0];

if (!newVersion) {
  console.error('❌ Please provide a version number');
  console.error('Usage: node scripts/update-version.js <version>');
  process.exit(1);
}

// Validate semver format
const semverRegex = /^\d+\.\d+\.\d+$/;
if (!semverRegex.test(newVersion)) {
  console.error('❌ Invalid version format. Use semver format (e.g., 1.2.3)');
  process.exit(1);
}

console.log(`📝 Updating version to ${newVersion}...`);

// Update manifest.json
const manifestPath = join(rootDir, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
manifest.version = newVersion;
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log('✅ Updated manifest.json');

console.log(`🎉 Version updated to ${newVersion}`);
console.log("Don't forget to update CHANGELOG.md!");
