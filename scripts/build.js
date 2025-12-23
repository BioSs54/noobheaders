/**
 * Build script for TypeScript to JavaScript compilation
 * Uses esbuild for fast, efficient bundling
 */

import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');
const watch = process.argv.includes('--watch');

const commonOptions = {
  bundle: true,
  format: 'esm',
  target: 'es2020',
  minify: !isDev,
  sourcemap: isDev,
};

// Ensure dist directory exists
if (!existsSync('dist')) {
  mkdirSync('dist', { recursive: true });
}

// Build configurations for each entry point
const builds = [
  {
    ...commonOptions,
    entryPoints: ['src/background.ts'],
    outfile: 'dist/background.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/popup.ts'],
    outfile: 'dist/popup.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/options.ts'],
    outfile: 'dist/options.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/i18n.ts'],
    outfile: 'dist/i18n.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/rules.ts'],
    outfile: 'dist/rules.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/auto-switch.ts'],
    outfile: 'dist/auto-switch.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/header-utils.ts'],
    outfile: 'dist/header-utils.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/filter-selection.ts'],
    outfile: 'dist/filter-selection.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/filter-utils.ts'],
    outfile: 'dist/filter-utils.js',
  },
  {
    ...commonOptions,
    entryPoints: ['src/welcome.ts'],
    outfile: 'dist/welcome.js',
  },
];

async function build() {
  try {
    console.log(`🔨 Building extension (${isDev ? 'development' : 'production'})...`);

    // Build all entry points
    for (const config of builds) {
      await esbuild.build(config);
    }

    // Copy static files
    console.log('📋 Copying static files...');

    const staticFiles = [
      'manifest.json',
      'popup.html',
      'options.html',
      'welcome.html',
      'styles.css',
      'LICENSE',
      'README.md',
    ];

    for (const file of staticFiles) {
      if (existsSync(file)) {
        cpSync(file, join('dist', file));
      }
    }

    // Copy _locales directory
    if (existsSync('_locales')) {
      cpSync('_locales', 'dist/_locales', { recursive: true });
    }

    // Copy icons directory
    if (existsSync('icons')) {
      cpSync('icons', 'dist/icons', { recursive: true });
    }

    console.log('✅ Build completed successfully!');

    if (watch) {
      console.log('👀 Watching for changes...');
      // In watch mode, we'd set up file watchers here
      // For simplicity, we'll just rebuild on change using esbuild's watch
    }
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
