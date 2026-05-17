import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runRipgrepGrep } from '#pi-toolbox/features/grep/ripgrep.js';

describe('ripgrep grep runner', () => {
  it('finds matches with the packaged ripgrep executable', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'const needle = true;\n');
    writeFileSync(path.join(cwd, 'notes.md'), 'haystack\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 10,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result).toEqual({
      matches: [{ file: 'index.ts', line: 1, text: 'const needle = true;' }],
      limited: false,
    });
  });

  it('searches hidden files by default while excluding git internals', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, '.git', 'objects'), { recursive: true });
    writeFileSync(path.join(cwd, '.env.example'), 'needle=example\n');
    writeFileSync(path.join(cwd, '.git', 'config'), 'needle=git\n');
    writeFileSync(path.join(cwd, '.git', 'objects', 'object-file'), 'needle=object\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 10,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result.matches).toEqual([{ file: '.env.example', line: 1, text: 'needle=example' }]);
  });

  it('excludes hidden files when visibleOnly is true', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'const needle = true;\n');
    writeFileSync(path.join(cwd, '.env.example'), 'needle=example\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 10,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: true,
    });

    // Assert
    expect(result.matches).toEqual([{ file: 'index.ts', line: 1, text: 'const needle = true;' }]);
  });
});

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-ripgrep-grep-test-'));
}
