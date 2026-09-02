import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

const fsMockState = vi.hoisted(() => ({ failedUnlinkPath: '', failedWritePath: '' }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    writeFile: (...args: unknown[]) => {
      if (args[0] === fsMockState.failedWritePath) {
        return Promise.reject(Object.assign(new Error('simulated write failure'), { code: 'EIO' }));
      }
      return Reflect.apply(actual.writeFile, undefined, args) as Promise<void>;
    },
    unlink: (...args: unknown[]) => {
      if (args[0] === fsMockState.failedUnlinkPath) {
        return Promise.reject(Object.assign(new Error('simulated unlink failure'), { code: 'EIO' }));
      }
      return Reflect.apply(actual.unlink, undefined, args) as Promise<void>;
    },
  };
});

import { applyPatch } from '#pi-toolbox/features/apply-patch/apply.js';
import { lines } from '#test/utils/lines.js';
import { makeTempDir } from '#test/utils/tool-test-helpers.js';

describe('applyPatch partial failure', () => {
  beforeEach(() => {
    fsMockState.failedUnlinkPath = '';
    fsMockState.failedWritePath = '';
  });

  it('retains earlier operations when a later write fails', async () => {
    // Arrange
    const cwd = makeTempDir('pi-toolbox-apply-patch-partial-failure-test-');
    fsMockState.failedWritePath = path.join(cwd, 'second.txt');
    const patch = lines(
      '*** Begin Patch',
      '*** Add File: first.txt',
      '+first',
      '*** Add File: second.txt',
      '+second',
      '*** End Patch'
    );

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toMatchObject({
      message: `Failed to write file ${fsMockState.failedWritePath}: simulated write failure`,
      completed: { added: ['first.txt'], modified: [], deleted: [] },
      hunk: { type: 'add', path: 'second.txt' },
    });
    expect(existsSync(path.join(cwd, 'first.txt'))).toBe(true);
    expect(existsSync(path.join(cwd, 'second.txt'))).toBe(false);
  });

  it('reports a written move destination when removing the source fails', async () => {
    // Arrange
    const cwd = makeTempDir('pi-toolbox-apply-patch-partial-move-test-');
    const sourcePath = path.join(cwd, 'old.txt');
    const destinationPath = path.join(cwd, 'new.txt');
    fsMockState.failedUnlinkPath = sourcePath;
    writeFileSync(sourcePath, 'old\n');
    const patch = lines(
      '*** Begin Patch',
      '*** Update File: old.txt',
      '*** Move to: new.txt',
      '@@',
      '-old',
      '+new',
      '*** End Patch'
    );

    // Act
    const operation = applyPatch({ cwd, patch });

    // Assert
    await expect(operation).rejects.toMatchObject({
      completed: { added: [], modified: [], deleted: [] },
      hunk: { type: 'update', path: 'old.txt', movePath: 'new.txt' },
      writtenMoveDestination: destinationPath,
    });
    expect(readFileSync(sourcePath, 'utf8')).toBe('old\n');
    expect(readFileSync(destinationPath, 'utf8')).toBe('new\n');
  });
});
