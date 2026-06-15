import { describe, expect, it } from 'vitest';
import { foldNewLines } from '#pi-cut/features/new-lines-folding/fold-new-lines.js';

const defaultConfig = {
  enabled: true,
  minNewLines: 10,
  foldTo: 5,
};

describe('foldNewLines', () => {
  it('folds default minimum new lines to the default target', () => {
    // Arrange
    const text = `before${'\n'.repeat(10)}after`;

    // Act
    const foldedText = foldNewLines(text, defaultConfig);

    // Assert
    expect(foldedText).toBe(`before${'\n'.repeat(5)}after`);
  });

  it.each([
    { name: 'folds custom minimum new lines', newLineCount: 4, expectedNewLineCount: 2 },
    { name: 'folds exactly the configured minimum new lines', newLineCount: 3, expectedNewLineCount: 2 },
    { name: 'does not fold below the configured minimum new lines', newLineCount: 2, expectedNewLineCount: 2 },
  ])('$name', ({ newLineCount, expectedNewLineCount }) => {
    // Arrange
    const text = `before${'\n'.repeat(newLineCount)}after`;
    const config = { ...defaultConfig, minNewLines: 3, foldTo: 2 };

    // Act
    const foldedText = foldNewLines(text, config);

    // Assert
    expect(foldedText).toBe(`before${'\n'.repeat(expectedNewLineCount)}after`);
  });

  it('preserves crlf newline style', () => {
    // Arrange
    const text = `before${'\r\n'.repeat(3)}after`;
    const config = { ...defaultConfig, minNewLines: 3, foldTo: 2 };

    // Act
    const foldedText = foldNewLines(text, config);

    // Assert
    expect(foldedText).toBe(`before${'\r\n'.repeat(2)}after`);
  });

  it('returns unchanged text when new lines folding is disabled', () => {
    // Arrange
    const text = `before${'\n'.repeat(10)}after`;
    const config = { ...defaultConfig, enabled: false };

    // Act
    const foldedText = foldNewLines(text, config);

    // Assert
    expect(foldedText).toBe(text);
  });
});
