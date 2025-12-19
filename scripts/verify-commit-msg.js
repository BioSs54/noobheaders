#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { argv } from 'node:process';

const msgFile = argv[2];
if (!msgFile) {
  console.error('No commit message file provided');
  process.exit(2);
}

const message = readFileSync(msgFile, 'utf8').trim().split('\n')[0];

// Conventional commit types
const types = 'feat|fix|chore|docs|style|refactor|test|ci|perf|build|revert';

// Regex: type(scope)?: <emoji> rest...
// Uses Unicode Extended Pictographic to match most emoji
const re = new RegExp(
  '^(?:' + types + ')(?:\\([^\\)]+\\))?:\\s\\p{Extended_Pictographic}\\s.+',
  'u'
);

if (!re.test(message)) {
  console.error('\n✖ Invalid commit message format');
  console.error('Expected format: <type>(<scope>)?: <gitmoji> <description>');
  console.error('Example: chore(ci): 📦 publish release assets');
  console.error('\nCommit message received:');
  console.error(`  ${message}\n`);
  process.exit(1);
}

process.exit(0);
