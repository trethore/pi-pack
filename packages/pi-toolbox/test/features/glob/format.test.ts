import { describe, expect, it } from 'vitest';

import { formatGlobResult } from '#pi-toolbox/features/glob/format.js';
import { lines } from '#test/utils/lines.js';

describe('formatGlobResult', () => {
  it('formats files as a compact whitespace tree', () => {
    // Arrange
    const files = ['src/app/page.tsx', 'src/app/layout.tsx', 'src/lib/utils.ts', 'src/lib/auth.ts'];

    // Act
    const output = formatGlobResult({ paths: ['.'], files });

    // Assert
    expect(output).toBe(
      lines(
        'found=4',
        'src/',
        '  app/',
        '    layout.tsx',
        '    page.tsx',
        '  lib/',
        '    auth.ts',
        '    utils.ts'
      )
    );
  });

  it('collapses directories until branching points', () => {
    // Arrange
    const files = [
      'foo/bar/some/thing/file1.txt',
      'foo/bar/some/thing/some/other/file2.txt',
      'foo/bar/some/thing/some/other/file3.txt',
      'foo/bar2/another.txt',
      'foo/bar3/deep/nested/path/final.txt',
    ];

    // Act
    const output = formatGlobResult({ paths: ['foo'], files });

    // Assert
    expect(output).toBe(
      lines(
        'found=5',
        'foo/',
        '  bar/some/thing/',
        '    file1.txt',
        '    some/other/',
        '      file2.txt',
        '      file3.txt',
        '  bar2/another.txt',
        '  bar3/deep/nested/path/final.txt'
      )
    );
  });

  it('formats empty results without extra tree lines', () => {
    expect(formatGlobResult({ paths: ['.'], files: [] })).toBe('found=0');
  });

  it('merges multiple search paths into one tree', () => {
    expect(
      formatGlobResult({
        paths: ['foo/bar/project1', 'foo/bar/project2'],
        files: [
          'foo/bar/project1/src/app/page.tsx',
          'foo/bar/project1/src/lib/utils.ts',
          'foo/bar/project2/docs/intro.md',
          'foo/bar/project2/docs/install.md',
        ],
      })
    ).toBe(
      lines(
        'found=4',
        'foo/bar/',
        '  project1/src/',
        '    app/page.tsx',
        '    lib/utils.ts',
        '  project2/docs/',
        '    install.md',
        '    intro.md'
      )
    );
  });

  it('formats absolute paths', () => {
    expect(
      formatGlobResult({
        paths: ['/tmp/test/git-repo'],
        files: ['/tmp/test/git-repo/ignored/ignored.txt', '/tmp/test/git-repo/src/visible.txt'],
      })
    ).toBe(lines('found=2', '/tmp/test/git-repo/', '  ignored/ignored.txt', '  src/visible.txt'));
  });

  it('deduplicates normalized file paths', () => {
    expect(
      formatGlobResult({
        paths: ['foo', 'foo/bar'],
        files: ['foo/bar/a.txt', './foo/bar/a.txt', 'foo/bar/b.txt'],
      })
    ).toBe(lines('found=2', 'foo/bar/', '  a.txt', '  b.txt'));
  });

  it('adds a footer when more files are available', () => {
    expect(formatGlobResult({ paths: ['.'], files: ['src/index.ts'], limited: true })).toBe(
      lines('found=1', 'src/index.ts', '[more files available]')
    );
  });
});
