import { describe, expect, it } from 'vitest';

import { isNegatedWildcardPattern, matchesWildcardPattern, stripWildcardNegation } from '#pi-toolmask/core/wildcard.js';

describe('matchesWildcardPattern', () => {
  it.each([
    ['read', 'read', true],
    ['read_file', 'read', false],
    ['project_read', '*read', true],
    ['project_reader', '*read', false],
    ['read_file', 'read*', true],
    ['project_read_file', '*read*', true],
    ['bash', '*', true],
    ['read.file', 'read.file', true],
    ['read-file', 'read.*', false],
  ])('matches %s against %s -> %s', (value, pattern, expected) => {
    expect(matchesWildcardPattern(value, pattern)).toBe(expected);
  });

  it.each([
    ['!read', true],
    ['!', false],
    ['read', false],
  ])('detects negated pattern %s -> %s', (pattern, expected) => {
    expect(isNegatedWildcardPattern(pattern)).toBe(expected);
  });

  it.each([
    ['!read', 'read'],
    ['read', 'read'],
  ])('strips negation from %s -> %s', (pattern, expected) => {
    expect(stripWildcardNegation(pattern)).toBe(expected);
  });
});
