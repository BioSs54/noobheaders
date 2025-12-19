import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
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

// Update HTML files: replace occurrences like v1.0.0 with the new version
const htmlFiles = readdirSync(rootDir).filter((f) => f.endsWith('.html'));

const versionRegex = /v\d+\.\d+\.\d+/g;

for (const file of htmlFiles) {
  const filePath = join(rootDir, file);
  const content = readFileSync(filePath, 'utf-8');
  if (versionRegex.test(content)) {
    const updated = content.replace(versionRegex, `v${newVersion}`);
    writeFileSync(filePath, updated);
    console.log(`✅ Updated version string in ${file}`);
  }
}

console.log(`🎉 Version updated to ${newVersion}`);
console.log("Don't forget to update CHANGELOG.md!");
