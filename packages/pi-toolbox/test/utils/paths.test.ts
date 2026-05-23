import { describe, expect, it } from 'vitest';

import {
  createCompactPathFormatter,
  formatRipgrepPaths,
  toDisplayPath,
  toPosixPath,
} from '#pi-toolbox/utils/paths.js';

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

  it('normalizes Windows paths to posix display paths on every platform', () => {
    expect(toDisplayPath(String.raw`.\src\index.ts`)).toBe('src/index.ts');
    expect(toPosixPath(String.raw`C:\repo\src\index.ts`)).toBe('C:/repo/src/index.ts');
  });

  it('keeps current-directory paths relative', () => {
    const formatPath = createCompactPathFormatter(['.']);

    expect(formatPath('src/index.ts')).toBe('src/index.ts');
  });

  it('formats paths relative to a single absolute search root', () => {
    const formatPath = createCompactPathFormatter(['/tmp/test/git-repo']);

    expect(formatPath('/tmp/test/git-repo/src/visible.txt')).toBe('src/visible.txt');
  });

  it('formats Windows paths relative to a single absolute search root', () => {
    const formatPath = createCompactPathFormatter([String.raw`C:\repo\project`]);

    expect(formatPath(String.raw`C:\repo\project\src\visible.txt`)).toBe('src/visible.txt');
  });

  it('uses the shortest unique suffix for conflicting root basenames', () => {
    const formatPath = createCompactPathFormatter(['/tmp1/a', '/tmp2/a']);

    expect(formatPath('/tmp1/a/file.txt')).toBe('tmp1/a/file.txt');
    expect(formatPath('/tmp2/a/file.txt')).toBe('tmp2/a/file.txt');
  });

  it('uses the shortest unique suffix for deeper root conflicts', () => {
    const formatPath = createCompactPathFormatter(['/home/u/project/src', '/tmp/project/src']);

    expect(formatPath('/home/u/project/src/a.ts')).toBe('u/project/src/a.ts');
    expect(formatPath('/tmp/project/src/a.ts')).toBe('tmp/project/src/a.ts');
  });

  it('keeps duplicate search roots compact and deterministic', () => {
    const formatPath = createCompactPathFormatter(['/tmp/project/src', '/tmp/project/src']);

    expect(formatPath('/tmp/project/src/a.ts')).toBe('a.ts');
  });

  it('leaves paths outside search roots unchanged', () => {
    const formatPath = createCompactPathFormatter(['/tmp/project/src']);

    expect(formatPath('/other/project/src/a.ts')).toBe('/other/project/src/a.ts');
  });

  it('uses the root label when a result is the exact single search path', () => {
    const formatPath = createCompactPathFormatter(['/tmp/project/src/index.ts']);

    expect(formatPath('/tmp/project/src/index.ts')).toBe('index.ts');
  });
});
