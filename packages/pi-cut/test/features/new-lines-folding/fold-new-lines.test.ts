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

  it('folds custom minimum new lines to the configured target', () => {
    // Arrange
    const text = `before${'\n'.repeat(4)}after`;
    const config = { ...defaultConfig, minNewLines: 3, foldTo: 2 };

    // Act
    const foldedText = foldNewLines(text, config);

    // Assert
    expect(foldedText).toBe(`before${'\n'.repeat(2)}after`);
  });

  it('folds exactly the configured minimum new lines', () => {
    // Arrange
    const text = `before${'\n'.repeat(3)}after`;
    const config = { ...defaultConfig, minNewLines: 3, foldTo: 2 };

    // Act
    const foldedText = foldNewLines(text, config);

    // Assert
    expect(foldedText).toBe(`before${'\n'.repeat(2)}after`);
  });

  it('does not fold below the configured minimum new lines', () => {
    // Arrange
    const text = `before${'\n'.repeat(2)}after`;
    const config = { ...defaultConfig, minNewLines: 3, foldTo: 2 };

    // Act
    const foldedText = foldNewLines(text, config);

    // Assert
    expect(foldedText).toBe(text);
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
