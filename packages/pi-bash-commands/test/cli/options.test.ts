import { describe, expect, it } from 'vitest';

import { parseFindCliOptions, parseGrepCliOptions } from '#pi-bash-commands/cli/shared/options.js';

describe('CLI options', () => {
  it('parses repeated pi-find options and defaults', () => {
    // Arrange and act
    const parsed = parseFindCliOptions([
      '--patterns',
      '*.ts',
      '--patterns',
      '!*.test.ts',
      '--paths',
      '@src',
      '--depth',
      '3',
      '--no-ignore',
    ]);

    // Assert
    expect(parsed).toEqual({
      help: false,
      options: {
        patterns: ['*.ts', '!*.test.ts'],
        paths: ['src'],
        limit: 100,
        depth: 3,
        noIgnore: true,
        visibleOnly: false,
      },
    });
  });

  it('parses repeated pi-grep options and numeric limits', () => {
    // Arrange and act
    const parsed = parseGrepCliOptions([
      '--regexes',
      'first',
      '--regexes',
      'second',
      '--paths',
      'src',
      '--globs',
      '*.ts',
      '--limit',
      '50',
      '--limit-per-file',
      '3',
      '--max-chars-per-match',
      '500',
      '--visible-only',
    ]);

    // Assert
    expect(parsed).toEqual({
      help: false,
      options: {
        regexes: ['first', 'second'],
        paths: ['src'],
        globs: ['*.ts'],
        limit: 50,
        limitPerFile: 3,
        depth: undefined,
        maxCharsPerMatch: 500,
        noIgnore: false,
        visibleOnly: true,
      },
    });
  });

  it('uses configured defaults while explicit options take precedence', () => {
    // Arrange and act
    const findDefaults = parseFindCliOptions([], { defaultLimit: 25 });
    const grepDefaults = parseGrepCliOptions(['--regexes', 'value'], {
      defaultLimit: 50,
      defaultLimitPerFile: 3,
      defaultMaxCharsPerMatch: 500,
    });
    const explicitGrepOptions = parseGrepCliOptions(
      ['--regexes', 'value', '--limit', '75', '--limit-per-file', '5', '--max-chars-per-match', '700'],
      {
        defaultLimit: 50,
        defaultLimitPerFile: 3,
        defaultMaxCharsPerMatch: 500,
      }
    );

    // Assert
    expect(findDefaults).toMatchObject({ help: false, options: { limit: 25 } });
    expect(grepDefaults).toMatchObject({
      help: false,
      options: { limit: 50, limitPerFile: 3, maxCharsPerMatch: 500 },
    });
    expect(explicitGrepOptions).toMatchObject({
      help: false,
      options: { limit: 75, limitPerFile: 5, maxCharsPerMatch: 700 },
    });
  });

  it('requires a non-empty grep regex and validates numeric ranges', () => {
    expect(() => parseGrepCliOptions([])).toThrow('regexes must contain at least one non-empty string');
    expect(() => parseGrepCliOptions(['--regexes', 'value', '--limit', '0'])).toThrow(
      '--limit must be an integer between 1 and 1000'
    );
    expect(() => parseFindCliOptions(['--depth', '1.5'])).toThrow('--depth must be an integer at least 1');
  });

  it('returns help before validating required options', () => {
    expect(parseGrepCliOptions(['--help'])).toEqual({ help: true });
    expect(parseFindCliOptions(['-h'])).toEqual({ help: true });
  });
});
