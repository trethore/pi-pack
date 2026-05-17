import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runRipgrepGlob } from '#pi-toolbox/features/glob/ripgrep.js';

describe('ripgrep glob runner', () => {
  it('discovers files with the packaged ripgrep executable', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'notes.md'), '# notes');

    // Act
    const result = await runRipgrepGlob({
      cwd,
      patterns: ['*.ts'],
      paths: ['.'],
      limit: 10,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result).toEqual({ files: ['index.ts'], limited: false });
  });

  it('includes hidden files by default while excluding git internals', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, '.git', 'objects'), { recursive: true });
    writeFileSync(path.join(cwd, '.env.example'), 'TOKEN=example');
    writeFileSync(path.join(cwd, '.git', 'config'), '[core]');
    writeFileSync(path.join(cwd, '.git', 'objects', 'object-file'), 'object');

    // Act
    const result = await runRipgrepGlob({
      cwd,
      patterns: ['**/*'],
      paths: ['.'],
      limit: 10,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result.files).toContain('.env.example');
    expect(result.files).not.toContain('.git/config');
    expect(result.files).not.toContain('.git/objects/object-file');
  });

  it('excludes hidden files when visibleOnly is true', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'export {};');
    writeFileSync(path.join(cwd, '.env.example'), 'TOKEN=example');

    // Act
    const result = await runRipgrepGlob({
      cwd,
      patterns: ['**/*'],
      paths: ['.'],
      limit: 10,
      noIgnore: false,
      visibleOnly: true,
    });

    // Assert
    expect(result.files).toContain('index.ts');
    expect(result.files).not.toContain('.env.example');
  });
});

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-ripgrep-glob-test-'));
}
