import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { runRipgrepFindFiles, type RunRipgrepFindFilesOptions } from '#pi-toolbox/features/find-files/ripgrep.js';
import {
  writeDepthFixture,
  writeHiddenGitFixture,
  writeHiddenIgnoredFixture,
  writeIndependentDepthFixture,
} from '#test/utils/ripgrep-test-helpers.js';
import { makeTempDir as makePrefixedTempDir } from '#test/utils/tool-test-helpers.js';

describe('ripgrep find_files runner', () => {
  it('discovers files with the packaged ripgrep executable', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'notes.md'), '# notes');

    // Act
    const result = await findFilesWithDefaults(cwd, { patterns: ['*.ts'] });

    // Assert
    expect(result).toEqual({ files: ['index.ts'], limited: false });
  });

  it('discovers files without glob filters when patterns are omitted', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, '.git'), { recursive: true });
    writeFileSync(path.join(cwd, 'index.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'notes.md'), '# notes');
    writeFileSync(path.join(cwd, '.gitignore'), 'ignored.txt\n');
    writeFileSync(path.join(cwd, 'ignored.txt'), 'ignored');

    // Act
    const result = await findFilesWithDefaults(cwd, { patterns: [] });

    // Assert
    expect(result.files).toEqual(expect.arrayContaining(['.gitignore', 'index.ts', 'notes.md']));
    expect(result.files).toHaveLength(3);
  });

  it('includes ignored files without glob filters when noIgnore is true', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, '.git'), { recursive: true });
    writeFileSync(path.join(cwd, '.gitignore'), 'ignored.txt\n');
    writeFileSync(path.join(cwd, 'ignored.txt'), 'ignored');

    // Act
    const result = await findFilesWithDefaults(cwd, { patterns: [], noIgnore: true });

    // Assert
    expect(result.files).toContain('ignored.txt');
  });

  it('limits directory traversal depth relative to each search path', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeDepthFixture(cwd, { root: 'root', child: 'child', grandchild: 'grandchild' });

    // Act
    const result = await findFilesWithDefaults(cwd, { patterns: ['**/*.txt'], depth: 2 });

    // Assert
    expect(result.files).toHaveLength(2);
    expect(result.files).toEqual(expect.arrayContaining(['nested/child.txt', 'root.txt']));
  });

  it('applies depth independently to each search path', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeIndependentDepthFixture(cwd, { child: 'child', grandchild: 'grandchild' });

    // Act
    const result = await findFilesWithDefaults(cwd, {
      patterns: ['**/*.txt'],
      paths: ['root', 'root/nested'],
      depth: 1,
    });

    // Assert
    expect(toRelativeFiles(cwd, result.files)).toEqual(['root/nested/child.txt']);
  });

  it('stops after collecting one result beyond the limit', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'z.txt'), 'z');
    writeFileSync(path.join(cwd, 'a.txt'), 'a');
    writeFileSync(path.join(cwd, 'm.txt'), 'm');

    // Act
    const result = await findFilesWithDefaults(cwd, { patterns: ['*.txt'], limit: 2 });

    // Assert
    expect(result.files).toHaveLength(2);
    expect(result.files.every((file) => ['a.txt', 'm.txt', 'z.txt'].includes(file))).toBe(true);
    expect(result.limited).toBe(true);
  });

  it('deduplicates files before applying the collection limit', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'dir'), { recursive: true });
    writeFileSync(path.join(cwd, 'dir', 'a.txt'), 'a');
    writeFileSync(path.join(cwd, 'dir', 'b.txt'), 'b');

    // Act
    const result = await findFilesWithDefaults(cwd, { paths: ['dir', path.join(cwd, 'dir', 'a.txt')], limit: 2 });

    // Assert
    expect(toRelativeFiles(cwd, result.files)).toEqual(['dir/a.txt', 'dir/b.txt']);
    expect(result.limited).toBe(false);
  });

  it('includes hidden files by default while excluding git internals', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeHiddenGitFixture(cwd, { hidden: 'TOKEN=example', gitConfig: '[core]', gitObject: 'object' });

    // Act
    const result = await findFilesWithDefaults(cwd);

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
    const result = await findFilesWithDefaults(cwd, { visibleOnly: true });

    // Assert
    expect(result.files).toContain('index.ts');
    expect(result.files).not.toContain('.env.example');
  });

  it('keeps hidden ignored files excluded when noIgnore and visibleOnly are both true', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeHiddenIgnoredFixture(cwd, { ignored: 'ignored', hidden: 'TOKEN=example' });

    // Act
    const result = await findFilesWithDefaults(cwd, { noIgnore: true, visibleOnly: true });

    // Assert
    expect(result.files).toContain('ignored.txt');
    expect(result.files).not.toContain('.env.example');
  });

  it('applies inclusion and exclusion glob patterns in order', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'index.ts'), 'export {};');
    writeFileSync(path.join(cwd, 'index.test.ts'), 'test();');
    writeFileSync(path.join(cwd, 'notes.md'), '# notes');

    // Act
    const result = await findFilesWithDefaults(cwd, { patterns: ['*.ts', '!*.test.ts'] });

    // Assert
    expect(result.files).toEqual(['index.ts']);
  });
});

function toRelativeFiles(cwd: string, files: readonly string[]): string[] {
  return files.map((file) => path.relative(cwd, path.resolve(cwd, file)));
}

function findFilesWithDefaults(cwd: string, overrides: Partial<Omit<RunRipgrepFindFilesOptions, 'cwd'>> = {}) {
  return runRipgrepFindFiles({
    cwd,
    patterns: ['**/*'],
    paths: ['.'],
    limit: 10,
    noIgnore: false,
    visibleOnly: false,
    ...overrides,
  });
}

function makeTempDir(): string {
  return makePrefixedTempDir('pi-toolbox-ripgrep-find-files-test-');
}
