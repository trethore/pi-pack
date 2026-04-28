import { describe, expect, it } from 'vitest';
import { foldDuplicateLines } from '#pi-cut/features/duplicate-line-folding/fold-duplicate-lines.js';

describe('foldDuplicateLines', () => {
  it('folds consecutive identical non-empty lines at the minimum repeat count', () => {
    // Arrange
    const text = 'same\nsame\nsame\nnext\n';
    const minRepeats = 3;

    // Act
    const foldedText = foldDuplicateLines(text, minRepeats);

    // Assert
    expect(foldedText).toBe('same\n[previous line repeated x2]\nnext\n');
  });

  it('does not fold below the minimum repeat count', () => {
    // Arrange
    const text = 'same\nsame\nnext\n';
    const minRepeats = 3;

    // Act
    const foldedText = foldDuplicateLines(text, minRepeats);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('does not fold empty lines', () => {
    // Arrange
    const text = '\n\n\n';
    const minRepeats = 3;

    // Act
    const foldedText = foldDuplicateLines(text, minRepeats);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('keeps independent duplicate runs separate', () => {
    // Arrange
    const text = 'a\na\na\nb\nb\nb\n';
    const minRepeats = 3;

    // Act
    const foldedText = foldDuplicateLines(text, minRepeats);

    // Assert
    expect(foldedText).toBe('a\n[previous line repeated x2]\nb\n[previous line repeated x2]\n');
  });
});
