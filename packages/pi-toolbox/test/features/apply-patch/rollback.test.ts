import { existsSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

const fsMockState = vi.hoisted(() => ({ failedWritePath: '' }));

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
  };
});

import { applyPatch } from '#pi-toolbox/features/apply-patch/apply.js';
import { lines } from '#test/utils/lines.js';
import { makeTempDir } from '#test/utils/tool-test-helpers.js';

describe('applyPatch rollback', () => {
  it('restores earlier operations when a later write fails', async () => {
    // Arrange
    const cwd = makeTempDir('pi-toolbox-apply-patch-rollback-test-');
    fsMockState.failedWritePath = path.join(cwd, 'second.txt');
    const patch = lines(
      '*** Begin Patch',
      '*** Add File: first.txt',
      '+first',
      '*** Add File: second.txt',
      '+second',
      '*** End Patch'
    );

    // Act and assert
    await expect(applyPatch({ cwd, patch })).rejects.toThrow('Failed to commit patch: simulated write failure');
    expect(existsSync(path.join(cwd, 'first.txt'))).toBe(false);
    expect(existsSync(path.join(cwd, 'second.txt'))).toBe(false);
  });
});
