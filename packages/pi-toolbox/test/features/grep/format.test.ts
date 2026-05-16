import { describe, expect, it } from 'vitest';

import { formatGrepResult } from '#pi-toolbox/features/grep/format.js';

describe('formatGrepResult', () => {
  it('formats matches grouped by file', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'src/agent/tools.ts', line: 12, text: 'export const globTool = ...' },
        { file: 'src/agent/tools.ts', line: 18, text: 'export const grepTool = ...' },
        { file: 'src/index.ts', line: 9, text: 'tools: [globTool, grepTool]' },
      ],
      limit: 100,
    });

    // Assert
    expect(result).toBe(`matches=3 files=2

src/agent/tools.ts
12: export const globTool = ...
18: export const grepTool = ...

src/index.ts
9: tools: [globTool, grepTool]`);
  });

  it('formats zero matches without an empty body', () => {
    expect(formatGrepResult({ matches: [], limit: 100 })).toBe('matches=0 files=0');
  });

  it('adds a footer when more matches are available', () => {
    expect(formatGrepResult({ matches: [], limit: 100, limited: true })).toBe(
      'matches=0 files=0\n\n[more matches available]'
    );
  });

  it('adds per-file footers only when more matches exist in that file', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'src/index.ts', line: 1, text: 'first' },
        { file: 'src/index.ts', line: 2, text: 'second' },
        { file: 'src/index.ts', line: 3, text: 'third' },
      ],
      limit: 100,
      limitPerFile: 2,
    });

    // Assert
    expect(result).toBe(`matches=2 files=1

src/index.ts
1: first
2: second
[more matches in this file]`);
  });

  it('separates the global footer from per-file footers', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'src/index.ts', line: 1, text: 'first' },
        { file: 'src/index.ts', line: 2, text: 'second' },
        { file: 'src/index.ts', line: 3, text: 'third' },
        { file: 'src/index.ts', line: 4, text: 'fourth' },
      ],
      limit: 3,
      limitPerFile: 2,
      limited: true,
    });

    // Assert
    expect(result).toBe(`matches=2 files=1

src/index.ts
1: first
2: second
[more matches in this file]

[more matches available]`);
  });

  it('formats clipped match text without a truncation marker', () => {
    expect(
      formatGrepResult({
        matches: [{ file: 'src/index.ts', line: 1, text: 'abc' }],
        limit: 100,
      })
    ).toBe(`matches=1 files=1

src/index.ts
1: abc`);
  });
});
