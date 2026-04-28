import { describe, expect, it } from 'vitest';
import { foldDuplicateLines } from '../../../src/features/duplicate-line-folding/fold-duplicate-lines.js';

describe('foldDuplicateLines', () => {
  it('folds consecutive identical non-empty lines at the minimum repeat count', () => {
    expect(foldDuplicateLines('same\nsame\nsame\nnext\n', 3)).toBe(
      'same\n[previous line repeated x2]\nnext\n'
    );
  });

  it('does not fold below the minimum repeat count', () => {
    expect(foldDuplicateLines('same\nsame\nnext\n', 3)).toBe('same\nsame\nnext\n');
  });

  it('does not fold empty lines', () => {
    expect(foldDuplicateLines('\n\n\n', 3)).toBe('\n\n\n');
  });

  it('keeps independent duplicate runs separate', () => {
    expect(foldDuplicateLines('a\na\na\nb\nb\nb\n', 3)).toBe(
      'a\n[previous line repeated x2]\nb\n[previous line repeated x2]\n'
    );
  });
});
