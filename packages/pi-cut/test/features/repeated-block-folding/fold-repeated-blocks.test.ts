import { describe, expect, it } from 'vitest';
import { foldRepeatedBlocks } from '../../../src/features/repeated-block-folding/fold-repeated-blocks.js';

describe('foldRepeatedBlocks', () => {
  it('folds consecutive repeated blocks at the minimum block size', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\n';
    const minLines = 3;
    const minRepeats = 2;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe('a\nb\nc\n[previous block of 3 lines repeated x1]\n');
  });

  it('folds all consecutive repetitions of the same block', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\na\nb\nc\n';
    const minLines = 3;
    const minRepeats = 2;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe('a\nb\nc\n[previous block of 3 lines repeated x2]\n');
  });

  it('does not fold blocks smaller than minLines', () => {
    // Arrange
    const text = 'a\nb\na\nb\n';
    const minLines = 3;
    const minRepeats = 2;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('does not fold empty blocks', () => {
    // Arrange
    const text = '\n\n\n\n\n\n';
    const minLines = 3;
    const minRepeats = 2;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('does not fold pure duplicate-line runs before duplicate line folding can process them', () => {
    // Arrange
    const text = 'x\nx\nx\nx\nx\nx\n';
    const minLines = 3;
    const minRepeats = 2;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('does not fold below minRepeats', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\n';
    const minLines = 3;
    const minRepeats = 3;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('folds when repeated blocks reach minRepeats', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\na\nb\nc\n';
    const minLines = 3;
    const minRepeats = 3;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe('a\nb\nc\n[previous block of 3 lines repeated x2]\n');
  });

  it('folds repeated blocks without a final line ending', () => {
    // Arrange
    const text = 'a\nb\nc\nd\na\nb\nc\nd';
    const minLines = 4;
    const minRepeats = 2;

    // Act
    const foldedText = foldRepeatedBlocks(text, minLines, minRepeats);

    // Assert
    expect(foldedText).toBe('a\nb\nc\nd\n[previous block of 4 lines repeated x1]');
  });
});
