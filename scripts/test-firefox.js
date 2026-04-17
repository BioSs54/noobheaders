#!/usr/bin/env node

/**
 * Manual Firefox testing script
 * Firefox extension validation uses web-ext because Playwright does not
 * reliably auto-load the Firefox extension in this repository setup.
 */

import { spawn } from 'node:child_process';
import { closeServer, createTestServer } from '../e2e/test-server.js';

function runCommand(command, args, label) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${label} failed with code ${code ?? 'unknown'}`));
    });
  });
}

async function ensureWebExtInstalled() {
  try {
    await runCommand('pnpm', ['exec', 'web-ext', '--version'], 'Check web-ext');
  } catch {
    console.log('📦 Installing web-ext...');
    await runCommand('pnpm', ['add', '-D', 'web-ext'], 'Install web-ext');
  }
}

console.log('🦊 Starting Firefox with NoobHeaders extension...\n');

const showBrowserConsole = process.env.NOOBHEADERS_FIREFOX_CONSOLE === '1';
const enableVerboseLogs = process.env.NOOBHEADERS_FIREFOX_VERBOSE === '1';

try {
  console.log('📦 Building packaged extension...');
  await runCommand('pnpm', ['run', 'package'], 'Package extension');

  await ensureWebExtInstalled();

  const server = await createTestServer(0);
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 3456;
  const startUrl = `http://localhost:${port}/headers`;

  console.log('🚀 Launching Firefox...\n');
  console.log('Instructions:');
  console.log('1. Firefox will open with the packaged extension pre-loaded');
  console.log('2. Click the NoobHeaders icon in the toolbar');
  console.log('3. Enable the global toggle (top switch)');
  console.log('4. Click "Add Header" button');
  console.log('5. Fill: Name="X-Test-Header", Value="TestValue"');
  console.log('6. Enable the profile toggle if needed');
  console.log(`7. Firefox opens directly on ${startUrl}`);
  console.log('8. Refresh the page and verify X-Test-Header in the JSON response');
  console.log('9. Open Developer Tools if you also want to inspect the network request\n');
  console.log(
    showBrowserConsole
      ? 'ℹ️  Firefox browser console enabled via NOOBHEADERS_FIREFOX_CONSOLE=1'
      : 'ℹ️  Firefox browser console disabled by default to avoid noisy internal warnings'
  );

  const webExtArgs = [
    'exec',
    'web-ext',
    'run',
    '--source-dir=./packages/firefox',
    '--start-url',
    startUrl,
  ];

  if (showBrowserConsole) {
    webExtArgs.push('--browser-console');
  }

  if (enableVerboseLogs) {
    webExtArgs.push('--verbose');
  }

  const child = spawn('pnpm', webExtArgs, { stdio: 'inherit' });
  let serverClosed = false;

  const shutdown = async () => {
    if (!serverClosed) {
      await closeServer(server);
      serverClosed = true;
    }
  };

  process.on('SIGINT', () => {
    child.kill('SIGINT');
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
  });

  child.on('close', async (code) => {
    await shutdown();
    console.log(`\n🛑 Firefox closed with code ${code}`);
    process.exit(code);
  });
} catch (error) {
  console.error('❌ Error:', error instanceof Error ? error.message : error);
  process.exit(1);
}
