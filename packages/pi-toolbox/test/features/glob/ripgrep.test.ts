import { mkdtempSync, writeFileSync } from 'node:fs';
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
      hidden: false,
    });

    // Assert
    expect(result).toEqual({ files: ['index.ts'], limited: false });
  });
});

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-ripgrep-glob-test-'));
}
