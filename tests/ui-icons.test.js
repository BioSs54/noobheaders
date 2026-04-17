import { strict as assert } from 'node:assert';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';

const legacyUiEmojis = [
  '🎓',
  '⚙️',
  '➕',
  '🗑️',
  '✏️',
  '🔽',
  '🔼',
  '💜',
  '💝',
  '💖',
  '💙',
  '🚀',
  '🔒',
  '⚡',
  '🎯',
  '📦',
  '🌍',
  '✨',
  '🔧',
  '💾',
  '🐛',
];

async function readWorkspaceFile(relativePath) {
  return readFile(path.join(process.cwd(), relativePath), 'utf-8');
}

describe('UI SVG Icons', () => {
  it('should include the shared SVG sprite and icon helper', async () => {
    await access(path.join(process.cwd(), 'icons/ui-sprite.svg'));
    await access(path.join(process.cwd(), 'src/ui-icons.ts'));
  });

  it('should avoid emoji glyphs in extension UI sources', async () => {
    const filesToCheck = [
      'popup.html',
      'options.html',
      'welcome.html',
      'src/popup.ts',
      'src/options.ts',
      'src/i18n.ts',
      '_locales/en/messages.json',
      '_locales/fr/messages.json',
      '_locales/es/messages.json',
    ];

    for (const file of filesToCheck) {
      const content = await readWorkspaceFile(file);
      assert.equal(
        legacyUiEmojis.some((emoji) => content.includes(emoji)),
        false,
        `${file} should not contain UI emojis once SVG icons are in place`
      );
    }
  });
});
