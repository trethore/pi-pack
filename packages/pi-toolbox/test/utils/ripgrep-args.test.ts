import { describe, expect, it } from 'vitest';

import {
  formatRipgrepSearchArgs,
  formatRipgrepSearchFilterArgs,
} from '#pi-toolbox/utils/ripgrep-args.js';

describe('ripgrep arg utilities', () => {
  it('formats shared search flags in a stable order', () => {
    expect(
      formatRipgrepSearchArgs({
        depth: 2,
        globs: ['*.ts', '!*.d.ts'],
        noIgnore: true,
        paths: ['src'],
        visibleOnly: true,
      })
    ).toEqual([
      '--max-depth',
      '2',
      '-g',
      '*.ts',
      '-g',
      '!*.d.ts',
      '-g',
      '!.*',
      '-g',
      '!**/.*',
      '-g',
      '!.git/**',
      '-g',
      '!**/.git/**',
      '--no-ignore',
      'src',
    ]);
  });

  it('formats shared search filters without path args', () => {
    expect(
      formatRipgrepSearchFilterArgs({
        globs: ['*.ts'],
        noIgnore: false,
        visibleOnly: false,
      })
    ).toEqual(['--hidden', '-g', '*.ts', '-g', '!.git/**', '-g', '!**/.git/**']);
  });

  it('includes hidden files by default and omits the default current directory path', () => {
    expect(
      formatRipgrepSearchArgs({
        globs: [],
        noIgnore: false,
        paths: ['.'],
        visibleOnly: false,
      })
    ).toEqual(['--hidden', '-g', '!.git/**', '-g', '!**/.git/**']);
  });
});
