import { describe, expect, it } from 'vitest';
import { truncateLines } from '#pi-cut/features/truncate-lines.js';

describe('truncateLines', () => {
  it('truncates lines longer than maxChars', () => {
    // Arrange
    const text = 'abcdef\n';
    const maxChars = 3;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe('abc [... truncated at 3/6 chars]\n');
  });

  it('leaves lines at maxChars unchanged', () => {
    // Arrange
    const text = 'abc\n';
    const maxChars = 3;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe(text);
  });

  it('truncates each line independently', () => {
    // Arrange
    const text = 'abcdef\nxy\n12345';
    const maxChars = 3;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe('abc [... truncated at 3/6 chars]\nxy\n123 [... truncated at 3/5 chars]');
  });

  it('counts unicode code points instead of UTF-16 code units', () => {
    // Arrange
    const symbol = '\u{1D11E}';
    const text = `${symbol}${symbol}${symbol}\n`;
    const maxChars = 2;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe(`${symbol}${symbol} [... truncated at 2/3 chars]\n`);
  });

  it('preserves the correct UTF-16 boundary for mixed-width characters', () => {
    // Arrange
    const text = `a\u{1D11E}bc\n`;
    const maxChars = 2;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe(`a\u{1D11E} [... truncated at 2/4 chars]\n`);
  });

  it.each(['[previous line repeated x12]', '[previous block of 123 lines repeated x45]'])(
    'preserves repetition marker %s',
    (marker) => {
      expect(truncateLines(`${marker}\n`, 1)).toBe(`${marker}\n`);
    }
  );
});
