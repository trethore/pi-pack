import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { withFileMutationQueue } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { createDeferred } from '@trethore/pi-shared/test/deferred.js';

import { applyPatch } from '#pi-toolbox/features/apply-patch/apply.js';
import { lines } from '#test/utils/lines.js';
import { makeTempDir as makePrefixedTempDir } from '#test/utils/tool-test-helpers.js';

describe('applyPatch', () => {
  it('applies add, update, and delete hunks', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'modify.txt'), 'line1\nline2\n');
    writeFileSync(path.join(cwd, 'delete.txt'), 'obsolete\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Add File: nested/new.txt',
      '+created',
      '*** Delete File: delete.txt',
      '*** Update File: modify.txt',
      '@@',
      '-line2',
      '+changed',
      '*** End Patch'
    );

    // Act
    const result = await applyPatch({ cwd, patch });

    // Assert
    expect(result).toEqual({ added: ['nested/new.txt'], modified: ['modify.txt'], deleted: ['delete.txt'] });
    expect(readFileSync(path.join(cwd, 'nested/new.txt'), 'utf8')).toBe('created\n');
    expect(readFileSync(path.join(cwd, 'modify.txt'), 'utf8')).toBe('line1\nchanged\n');
    expect(existsSync(path.join(cwd, 'delete.txt'))).toBe(false);
  });

  it('applies multiple chunks in order', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'multi.txt'), 'line1\nline2\nline3\nline4\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: multi.txt',
      '@@',
      '-line2',
      '+changed2',
      '@@',
      '-line4',
      '+changed4',
      '*** End Patch'
    );

    // Act
    await applyPatch({ cwd, patch });

    // Assert
    expect(readFileSync(path.join(cwd, 'multi.txt'), 'utf8')).toBe('line1\nchanged2\nline3\nchanged4\n');
  });

  it('moves a file to a new directory', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'old'), { recursive: true });
    writeFileSync(path.join(cwd, 'old/name.txt'), 'old content\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: old/name.txt',
      '*** Move to: renamed/dir/name.txt',
      '@@',
      '-old content',
      '+new content',
      '*** End Patch'
    );

    // Act
    const result = await applyPatch({ cwd, patch });

    // Assert
    expect(result).toEqual({ added: [], modified: ['renamed/dir/name.txt'], deleted: [] });
    expect(existsSync(path.join(cwd, 'old/name.txt'))).toBe(false);
    expect(readFileSync(path.join(cwd, 'renamed/dir/name.txt'), 'utf8')).toBe('new content\n');
  });

  it('uses workdir for relative paths', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'packages/pi-toolbox'), { recursive: true });
    writeFileSync(path.join(cwd, 'packages/pi-toolbox/README.md'), 'old\n');
    const patch = lines('*** Begin Patch', '*** Update File: README.md', '@@', '-old', '+new', '*** End Patch');

    // Act
    await applyPatch({ cwd, workdir: 'packages/pi-toolbox', patch });

    // Assert
    expect(readFileSync(path.join(cwd, 'packages/pi-toolbox/README.md'), 'utf8')).toBe('new\n');
  });

  it('allows absolute paths outside cwd', async () => {
    // Arrange
    const cwd = makeTempDir();
    const outside = path.join(makeTempDir(), 'outside.txt');
    const patch = lines('*** Begin Patch', `*** Add File: ${outside}`, '+outside', '*** End Patch');

    // Act
    await applyPatch({ cwd, patch });

    // Assert
    expect(readFileSync(outside, 'utf8')).toBe('outside\n');
  });

  it('appends a trailing newline to updated files', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'no-newline.txt'), 'no newline at end');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: no-newline.txt',
      '@@',
      '-no newline at end',
      '+first line',
      '+second line',
      '*** End Patch'
    );

    // Act
    await applyPatch({ cwd, patch });

    // Assert
    expect(readFileSync(path.join(cwd, 'no-newline.txt'), 'utf8')).toBe('first line\nsecond line\n');
  });

  it('fails before mutating files when preflight detects a later error', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'modify.txt'), 'line1\nline2\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: modify.txt',
      '@@',
      '-line2',
      '+changed',
      '*** Update File: missing.txt',
      '@@',
      '-old',
      '+new',
      '*** End Patch'
    );

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toThrow('Failed to read file to update');
    expect(readFileSync(path.join(cwd, 'modify.txt'), 'utf8')).toBe('line1\nline2\n');
  });

  it('rejects missing context and keeps the file unchanged', async () => {
    // Arrange
    const cwd = makeTempDir();
    const filePath = path.join(cwd, 'modify.txt');
    writeFileSync(filePath, 'line1\nline2\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: modify.txt',
      '@@',
      '-missing',
      '+changed',
      '*** End Patch'
    );

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toThrow(`Failed to find expected lines in ${filePath}`);
    await expect(operation).rejects.not.toThrow('missing');
    expect(readFileSync(filePath, 'utf8')).toBe('line1\nline2\n');
  });

  it('rejects deleting a directory', async () => {
    // Arrange
    const cwd = makeTempDir();
    mkdirSync(path.join(cwd, 'dir'));
    const patch = lines('*** Begin Patch', '*** Delete File: dir', '*** End Patch');

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toThrow(`Failed to delete file ${path.join(cwd, 'dir')}`);
  });

  it('rejects adding a file that already exists', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'existing.txt'), 'original\n');
    const patch = lines('*** Begin Patch', '*** Add File: existing.txt', '+replacement', '*** End Patch');

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toThrow('path already exists');
    expect(readFileSync(path.join(cwd, 'existing.txt'), 'utf8')).toBe('original\n');
  });

  it('rejects moving a file over an existing destination', async () => {
    // Arrange
    const cwd = makeTempDir();
    writeFileSync(path.join(cwd, 'source.txt'), 'source\n');
    writeFileSync(path.join(cwd, 'destination.txt'), 'destination\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: source.txt',
      '*** Move to: destination.txt',
      '@@',
      '-source',
      '+moved',
      '*** End Patch'
    );

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toThrow('destination already exists');
    expect(readFileSync(path.join(cwd, 'source.txt'), 'utf8')).toBe('source\n');
    expect(readFileSync(path.join(cwd, 'destination.txt'), 'utf8')).toBe('destination\n');
  });

  it('rejects planned file paths that conflict as parent and child', async () => {
    // Arrange
    const cwd = makeTempDir();
    const patch = lines(
      '*** Begin Patch',
      '*** Add File: parent',
      '+parent',
      '*** Add File: parent/child.txt',
      '+child',
      '*** End Patch'
    );

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toThrow('conflicts with planned file');
    expect(existsSync(path.join(cwd, 'parent'))).toBe(false);
  });

  it('waits for Pi file mutations targeting the same path', async () => {
    // Arrange
    const cwd = makeTempDir();
    const targetPath = path.join(cwd, 'shared.txt');
    writeFileSync(targetPath, 'original\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: shared.txt',
      '@@',
      '-original',
      '+patched',
      '*** End Patch'
    );
    const locked = createDeferred();
    const release = createDeferred();
    const existingMutation = withFileMutationQueue(targetPath, async () => {
      locked.resolve();
      await release.promise;
    });
    await locked.promise;
    let patchSettled = false;

    // Act
    const patchOperation = applyPatch({ cwd, patch }).finally(() => {
      patchSettled = true;
    });
    await new Promise<void>((resolve) => {
      setImmediate(resolve);
    });

    // Assert
    expect(patchSettled).toBe(false);
    release.resolve();
    await existingMutation;
    await patchOperation;
    expect(readFileSync(targetPath, 'utf8')).toBe('patched\n');
  });
});

function makeTempDir(): string {
  return makePrefixedTempDir('pi-toolbox-apply-patch-test-');
}
