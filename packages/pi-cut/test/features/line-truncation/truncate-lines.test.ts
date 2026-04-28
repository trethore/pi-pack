import { describe, expect, it } from 'vitest';
import { truncateLines } from '#pi-cut/features/line-truncation/truncate-lines.js';

describe('truncateLines', () => {
  it('truncates lines longer than maxChars', () => {
    // Arrange
    const text = 'abcdef\n';
    const maxChars = 3;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe('abc [... truncated, +3 chars]\n');
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
    expect(truncatedText).toBe('abc [... truncated, +3 chars]\nxy\n123 [... truncated, +2 chars]');
  });

  it('counts unicode code points instead of UTF-16 code units', () => {
    // Arrange
    const symbol = '\u{1D11E}';
    const text = `${symbol}${symbol}${symbol}\n`;
    const maxChars = 2;

    // Act
    const truncatedText = truncateLines(text, maxChars);

    // Assert
    expect(truncatedText).toBe(`${symbol}${symbol} [... truncated, +1 chars]\n`);
  });
});
