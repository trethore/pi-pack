import { describe, expect, it } from 'vitest';

import { formatRipgrepPaths, toDisplayPath, toPosixPath } from '#pi-toolbox/utils/paths.js';

describe('path utilities', () => {
  it('omits the default current directory path from ripgrep args', () => {
    expect(formatRipgrepPaths(['.'])).toEqual([]);
  });

  it('keeps explicit ripgrep paths', () => {
    expect(formatRipgrepPaths(['.', 'src'])).toEqual(['.', 'src']);
    expect(formatRipgrepPaths(['src'])).toEqual(['src']);
  });

  it('formats display paths as relative posix paths when possible', () => {
    expect(toDisplayPath('./src/index.ts')).toBe('src/index.ts');
    expect(toPosixPath('src/index.ts')).toBe('src/index.ts');
  });
});
