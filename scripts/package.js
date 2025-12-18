import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createWriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import archiver from 'archiver';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// Read manifest version
const manifest = JSON.parse(readFileSync(join(rootDir, 'manifest.json'), 'utf-8'));
const version = manifest.version;

// Files to include (from dist directory after build)
const files = [
  'manifest.json',
  'background.js',
  'popup.html',
  'popup.js',
  'i18n.js',
  'styles.css',
  'options.html',
  'options.js',
  'welcome.html',
  'LICENSE',
  '_locales/**/*',
  'icons/*.png',
];

async function packageExtension() {
  console.log(`📦 Packaging NoobHeaders v${version}...`);

  const buildDistDir = join(rootDir, 'dist'); // Output from TypeScript build
  const packagesDir = join(rootDir, 'packages');
  const chromeDir = join(packagesDir, 'chrome');
  const firefoxDir = join(packagesDir, 'firefox');

  // Create packages directories
  mkdirSync(chromeDir, { recursive: true });
  mkdirSync(firefoxDir, { recursive: true });

  // Copy files for Chrome from dist
  console.log('📁 Copying files for Chrome...');
  copyFiles(buildDistDir, chromeDir);

  // Copy files for Firefox (same for now)
  console.log('📁 Copying files for Firefox...');
  copyFiles(buildDistDir, firefoxDir);

  // Create ZIP for Chrome
  console.log('🗜️  Creating Chrome ZIP...');
  await createZip(chromeDir, join(packagesDir, `noobheaders-chrome-v${version}.zip`));

  // Create ZIP for Firefox
  console.log('🗜️  Creating Firefox ZIP...');
  await createZip(firefoxDir, join(packagesDir, `noobheaders-firefox-v${version}.zip`));

  console.log('✅ Packaging complete!');
  console.log(`📦 Chrome: packages/noobheaders-chrome-v${version}.zip`);
  console.log(`📦 Firefox: packages/noobheaders-firefox-v${version}.zip`);
}

function copyFiles(src, dest) {
  const filesToCopy = [
    'manifest.json',
    'background.js',
    'popup.html',
    'popup.js',
    'i18n.js',
    'styles.css',
    'options.html',
    'options.js',
    'welcome.html',
    'LICENSE',
  ];

  const dirsToCopy = ['_locales', 'icons'];

  for (const file of filesToCopy) {
    cpSync(join(src, file), join(dest, file));
  }

  for (const dir of dirsToCopy) {
    cpSync(join(src, dir), join(dest, dir), { recursive: true });
  }
}

function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => resolve());
    archive.on('error', (err) => reject(err));

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

packageExtension().catch((error) => {
  console.error('❌ Error packaging extension:', error);
  process.exit(1);
});
