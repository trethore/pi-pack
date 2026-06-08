import { describe, expect, it } from 'vitest';

import {
  formatOptionalStringListFlag,
  formatStringList,
  normalizeOptionalStringList,
  normalizeRequiredStringList,
  normalizeStringList,
} from '#pi-toolbox/utils/string-list.js';

describe('string list utilities', () => {
  it('trims, removes empty values, and deduplicates while preserving order', () => {
    expect(normalizeStringList([' src ', '', 'test', 'src', '  '])).toEqual(['src', 'test']);
  });

  it('throws for required lists without non-empty values', () => {
    expect(() => normalizeRequiredStringList([' ', ''], { name: 'patterns', toolName: 'find_files' })).toThrow(
      'find_files failed: patterns must contain at least one non-empty string'
    );
  });

  it('returns fallback values for optional empty lists', () => {
    expect(normalizeOptionalStringList([' '], ['.'])).toEqual(['.']);
  });

  it('formats lists and optional list flags', () => {
    expect(formatStringList([' src ', 'test'], '.')).toBe('src,test');
    expect(formatStringList([], '.')).toBe('.');
    expect(formatOptionalStringListFlag('globs', ['*.ts', ''])).toBe('globs [*.ts]');
    expect(formatOptionalStringListFlag('globs', [])).toBeUndefined();
  });
});
