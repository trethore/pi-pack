import { describe, expect, it } from 'vitest';

import { formatGlobResult } from '#pi-toolbox/features/glob/format.js';

describe('formatGlobResult', () => {
  it('formats files as a compact tree', () => {
    // Arrange
    const files = ['test/glob.test.ts', 'src/agent/tools.ts', 'src/index.ts', 'src/agent/glob.ts'];

    // Act
    const output = formatGlobResult({ paths: ['.'], files });

    // Assert
    expect(output).toBe(`paths=. count=4
src/
  index.ts
  agent/
    glob.ts
    tools.ts
test/
  glob.test.ts`);
  });

  it('formats empty results without extra tree lines', () => {
    expect(formatGlobResult({ paths: ['.'], files: [] })).toBe('paths=. count=0');
  });

  it('formats multiple search paths in the header', () => {
    expect(formatGlobResult({ paths: ['packages', 'scripts'], files: [] })).toBe(
      'paths=packages,scripts count=0'
    );
  });

  it('formats files relative to a single absolute search root', () => {
    expect(
      formatGlobResult({
        paths: ['/tmp/test/git-repo'],
        files: ['/tmp/test/git-repo/ignored/ignored.txt', '/tmp/test/git-repo/src/visible.txt'],
      })
    ).toBe(`paths=/tmp/test/git-repo count=2
ignored/
  ignored.txt
src/
  visible.txt`);
  });

  it('uses shortest unique root suffixes for conflicting search roots', () => {
    expect(
      formatGlobResult({
        paths: ['/home/u/project/src', '/tmp/project/src'],
        files: ['/home/u/project/src/a.ts', '/tmp/project/src/a.ts'],
      })
    ).toBe(`paths=/home/u/project/src,/tmp/project/src count=2
tmp/project/src/
  a.ts
u/project/src/
  a.ts`);
  });

  it('adds a footer when more files are available', () => {
    expect(formatGlobResult({ paths: ['.'], files: ['src/index.ts'], limited: true })).toBe(
      `paths=. count=1
src/
  index.ts
[more files available]`
    );
  });
});
