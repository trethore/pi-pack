import { describe, expect, it } from 'vitest';
import { truncateLines } from '../../../src/features/line-truncation/truncate-lines.js';

describe('truncateLines', () => {
  it('truncates lines longer than maxChars', () => {
    expect(truncateLines('abcdef\n', 3)).toBe('abc [... truncated, +3 chars]\n');
  });

  it('leaves lines at maxChars unchanged', () => {
    expect(truncateLines('abc\n', 3)).toBe('abc\n');
  });

  it('truncates each line independently', () => {
    expect(truncateLines('abcdef\nxy\n12345', 3)).toBe(
      'abc [... truncated, +3 chars]\nxy\n123 [... truncated, +2 chars]'
    );
  });

  it('counts unicode code points instead of UTF-16 code units', () => {
    expect(truncateLines('😀😀😀\n', 2)).toBe('😀😀 [... truncated, +1 chars]\n');
  });
});
