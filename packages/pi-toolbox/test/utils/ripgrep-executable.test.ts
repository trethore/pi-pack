import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { getRipgrepExecutable } from '#pi-toolbox/utils/ripgrep-executable.js';

describe('ripgrep executable resolution', () => {
  it('resolves the packaged ripgrep binary for the current platform', () => {
    const executable = getRipgrepExecutable();

    expect(executable).not.toBe('rg');
    expect(existsSync(executable)).toBe(true);
  });
});
