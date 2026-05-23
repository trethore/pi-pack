import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { parseRipgrepMatchLine, runRipgrepGrep } from '#pi-toolbox/features/grep/ripgrep.js';

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

  it('limits directory traversal depth relative to each search path', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'nested', 'deep'), { recursive: true });
    writeFileSync(path.join(cwd, 'root.txt'), 'needle root\n');
    writeFileSync(path.join(cwd, 'nested', 'child.txt'), 'needle child\n');
    writeFileSync(path.join(cwd, 'nested', 'deep', 'grandchild.txt'), 'needle grandchild\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 10,
      depth: 2,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    const matches = toRelativeMatches(cwd, result.matches);

    expect(matches).toHaveLength(2);
    expect(matches).toEqual(
      expect.arrayContaining([
        { file: 'nested/child.txt', line: 1, text: 'needle child' },
        { file: 'root.txt', line: 1, text: 'needle root' },
      ])
    );
  });

  it('applies depth independently to each search path', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'root', 'nested', 'deep'), { recursive: true });
    writeFileSync(path.join(cwd, 'root', 'nested', 'child.txt'), 'needle child\n');
    writeFileSync(
      path.join(cwd, 'root', 'nested', 'deep', 'grandchild.txt'),
      'needle grandchild\n'
    );

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['root', 'root/nested'],
      globs: [],
      limit: 10,
      depth: 1,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(toRelativeMatches(cwd, result.matches)).toEqual([
      { file: 'root/nested/child.txt', line: 1, text: 'needle child' },
    ]);
  });

  it('searches explicit file paths regardless of traversal depth', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'nested', 'deep'), { recursive: true });
    writeFileSync(path.join(cwd, 'nested', 'deep', 'target.txt'), 'needle target\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['nested/deep/target.txt'],
      globs: [],
      limit: 10,
      depth: 1,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result.matches).toEqual([
      { file: 'nested/deep/target.txt', line: 1, text: 'needle target' },
    ]);
  });

  it('sorts matches by path before applying the collection limit', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'z.txt'), 'needle z\n');
    writeFileSync(path.join(cwd, 'a.txt'), 'needle a\n');
    writeFileSync(path.join(cwd, 'm.txt'), 'needle m\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 2,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result).toEqual({
      matches: [
        { file: 'a.txt', line: 1, text: 'needle a' },
        { file: 'm.txt', line: 1, text: 'needle m' },
      ],
      limited: true,
    });
  });

  it('deduplicates matches before applying the collection limit', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'dir'), { recursive: true });
    writeFileSync(path.join(cwd, 'dir', 'a.txt'), 'needle a\n');
    writeFileSync(path.join(cwd, 'dir', 'b.txt'), 'needle b\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['dir', path.join(cwd, 'dir', 'a.txt')],
      globs: [],
      limit: 2,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(toRelativeMatches(cwd, result.matches)).toEqual([
      { file: 'dir/a.txt', line: 1, text: 'needle a' },
      { file: 'dir/b.txt', line: 1, text: 'needle b' },
    ]);
    expect(result.limited).toBe(false);
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

  it('keeps hidden ignored files excluded when noIgnore and visibleOnly are both true', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, '.gitignore'), 'ignored.txt\n');
    writeFileSync(path.join(cwd, 'ignored.txt'), 'needle ignored\n');
    writeFileSync(path.join(cwd, '.env.example'), 'needle hidden\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: [],
      limit: 10,
      maxCharsPerMatch: 200,
      noIgnore: true,
      visibleOnly: true,
    });

    // Assert
    expect(result.matches).toEqual([{ file: 'ignored.txt', line: 1, text: 'needle ignored' }]);
  });

  it('applies inclusion and exclusion globs in order', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'needle ts\n');
    writeFileSync(path.join(cwd, 'index.test.ts'), 'needle test\n');
    writeFileSync(path.join(cwd, 'notes.md'), 'needle md\n');

    // Act
    const result = await runRipgrepGrep({
      cwd,
      regexes: ['needle'],
      paths: ['.'],
      globs: ['*.ts', '!*.test.ts'],
      limit: 10,
      maxCharsPerMatch: 200,
      noIgnore: false,
      visibleOnly: false,
    });

    // Assert
    expect(result.matches).toEqual([{ file: 'index.ts', line: 1, text: 'needle ts' }]);
  });

  it('skips ripgrep JSON match events without text fields', () => {
    expect(
      parseRipgrepMatchLine(
        JSON.stringify({
          type: 'match',
          data: { path: {}, lines: { text: 'needle' }, line_number: 1 },
        }),
        200
      )
    ).toBeUndefined();
    expect(
      parseRipgrepMatchLine(
        JSON.stringify({
          type: 'match',
          data: { path: { text: 'file.txt' }, lines: {}, line_number: 1 },
        }),
        200
      )
    ).toBeUndefined();
  });
});

function toRelativeMatches(
  cwd: string,
  matches: readonly { file: string; line: number; text: string }[]
): { file: string; line: number; text: string }[] {
  return matches.map((match) => ({
    ...match,
    file: path.relative(cwd, path.resolve(cwd, match.file)),
  }));
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-ripgrep-grep-test-'));
}
