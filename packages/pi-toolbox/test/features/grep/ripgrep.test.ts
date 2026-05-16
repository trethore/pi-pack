import { mkdtempSync, writeFileSync } from 'node:fs';
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
      hidden: false,
    });

    // Assert
    expect(result).toEqual({
      matches: [{ file: 'index.ts', line: 1, text: 'const needle = true;' }],
      limited: false,
    });
  });
});

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-ripgrep-grep-test-'));
}
