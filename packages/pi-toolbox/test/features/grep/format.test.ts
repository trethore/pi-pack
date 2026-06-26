import { describe, expect, it } from 'vitest';

import { formatGrepResult } from '#pi-toolbox/features/grep/format.js';
import { lines } from '#test/utils/lines.js';

describe('formatGrepResult', () => {
  it('formats matches grouped by file', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'src/agent/tools.ts', line: 12, text: 'export const findFilesTool = ...' },
        { file: 'src/agent/tools.ts', line: 18, text: 'export const grepTool = ...' },
        { file: 'src/index.ts', line: 9, text: 'tools: [findFilesTool, grepTool]' },
      ],
      limit: 100,
    });

    // Assert
    expect(result).toBe(
      lines(
        'matches=3 files=2',
        'src/agent/tools.ts',
        '12: export const findFilesTool = ...',
        '18: export const grepTool = ...',
        'src/index.ts',
        '9: tools: [findFilesTool, grepTool]'
      )
    );
  });

  it('formats zero matches without an empty body', () => {
    expect(formatGrepResult({ matches: [], limit: 100 })).toBe('matches=0 files=0');
  });

  it('sorts matches by file and line before formatting', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'b.txt', line: 2, text: 'b2' },
        { file: 'a.txt', line: 2, text: 'a2' },
        { file: 'b.txt', line: 1, text: 'b1' },
        { file: 'a.txt', line: 1, text: 'a1' },
      ],
      limit: 100,
    });

    // Assert
    expect(result).toBe(lines('matches=4 files=2', 'a.txt', '1: a1', '2: a2', 'b.txt', '1: b1', '2: b2'));
  });

  it('deduplicates matches returned through overlapping search paths', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'README.md', line: 39, text: '- `patterns`: glob pattern(s)' },
        { file: 'README.md', line: 40, text: '- `paths`: directories to search in' },
        { file: 'README.md', line: 39, text: '- `patterns`: glob pattern(s)' },
        { file: 'README.md', line: 40, text: '- `paths`: directories to search in' },
      ],
      limit: 100,
    });

    // Assert
    expect(result).toBe(
      lines(
        'matches=2 files=1',
        'README.md',
        '39: - `patterns`: glob pattern(s)',
        '40: - `paths`: directories to search in'
      )
    );
  });

  it('formats files relative to a single absolute search root', () => {
    // Arrange and act
    const result = formatGrepResult({
      paths: ['/tmp/test/git-repo'],
      matches: [{ file: '/tmp/test/git-repo/src/visible.txt', line: 1, text: 'visible TODO' }],
      limit: 100,
    });

    // Assert
    expect(result).toBe(lines('matches=1 files=1', 'src/visible.txt', '1: visible TODO'));
  });

  it('uses shortest unique root suffixes for conflicting search roots', () => {
    // Arrange and act
    const result = formatGrepResult({
      paths: ['/home/u/project/src', '/tmp/project/src'],
      matches: [
        { file: '/home/u/project/src/a.ts', line: 1, text: 'home match' },
        { file: '/tmp/project/src/a.ts', line: 1, text: 'tmp match' },
      ],
      limit: 100,
    });

    // Assert
    expect(result).toBe(
      lines('matches=2 files=2', 'tmp/project/src/a.ts', '1: tmp match', 'u/project/src/a.ts', '1: home match')
    );
  });

  it('adds a footer when more matches are available', () => {
    expect(formatGrepResult({ matches: [], limit: 100, limited: true })).toBe(
      'matches=0 files=0\n[more matches available]'
    );
  });

  it('adds per-file footers only when more matches exist in that file', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: srcIndexMatches('first', 'second', 'third'),
      limit: 100,
      limitPerFile: 2,
    });

    // Assert
    expect(result).toBe(
      lines('matches=2 files=1', 'src/index.ts', '1: first', '2: second', '[more matches in this file]')
    );
  });

  it('separates the global footer from per-file footers', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: srcIndexMatches('first', 'second', 'third', 'fourth'),
      limit: 3,
      limitPerFile: 2,
      limited: true,
    });

    // Assert
    expect(result).toBe(
      lines(
        'matches=2 files=1',
        'src/index.ts',
        '1: first',
        '2: second',
        '[more matches in this file]',
        '[more matches available]'
      )
    );
  });

  it('does not mark the global limit hit for extra matches in already per-file-limited files', () => {
    // Arrange and act
    const result = formatGrepResult({
      matches: [
        { file: 'a.txt', line: 1, text: 'a1' },
        { file: 'a.txt', line: 2, text: 'a2' },
        { file: 'b.txt', line: 1, text: 'b1' },
        { file: 'b.txt', line: 2, text: 'b2' },
        { file: 'c.txt', line: 1, text: 'c1' },
        { file: 'c.txt', line: 2, text: 'c2' },
      ],
      limit: 3,
      limitPerFile: 1,
    });

    // Assert
    expect(result).toBe(
      lines(
        'matches=3 files=3',
        'a.txt',
        '1: a1',
        '[more matches in this file]',
        'b.txt',
        '1: b1',
        '[more matches in this file]',
        'c.txt',
        '1: c1',
        '[more matches in this file]'
      )
    );
  });

  it('formats already-clipped match text as provided by the runner', () => {
    expect(
      formatGrepResult({
        matches: [{ file: 'src/index.ts', line: 1, text: 'abc' }],
        limit: 100,
      })
    ).toBe(lines('matches=1 files=1', 'src/index.ts', '1: abc'));
  });
});

function srcIndexMatches(...texts: string[]) {
  return texts.map((text, index) => ({ file: 'src/index.ts', line: index + 1, text }));
}
