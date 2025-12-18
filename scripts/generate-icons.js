import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const sizes = [16, 48, 128];
const svgPath = join(rootDir, 'icons', 'icon.svg');

async function generateIcons() {
  try {
    console.log('📦 Generating icons from SVG...');

    const svgBuffer = readFileSync(svgPath);

    for (const size of sizes) {
      const outputPath = join(rootDir, 'icons', `icon${size}.png`);

      await sharp(svgBuffer)
        .resize(size, size)
        .png({ quality: 100, compressionLevel: 9 })
        .toFile(outputPath);

      console.log(`✅ Generated icon${size}.png`);
    }

    console.log('🎉 All icons generated successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
