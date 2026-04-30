import { describe, expect, it } from 'vitest';
import { cleanTerminalOutput } from '#pi-cut/features/terminal-cleanup/clean-terminal-output.js';

describe('cleanTerminalOutput', () => {
  it('strips ANSI escape sequences when enabled', () => {
    // Arrange
    const text = '\u001B[31mred\u001B[0m plain';
    const config = makeConfig({ stripAnsi: true });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('red plain');
  });

  it('keeps ANSI escape sequences when disabled', () => {
    // Arrange
    const text = '\u001B[31mred\u001B[0m';
    const config = makeConfig({ stripAnsi: false });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe(text);
  });

  it('collapses carriage-return redraws when enabled', () => {
    // Arrange
    const text = 'progress 10%\rprogress 100%\ndone\n';
    const config = makeConfig({ collapseCarriageReturns: true });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('progress 100%\ndone\n');
  });

  it('keeps carriage-return redraws when disabled', () => {
    // Arrange
    const text = 'progress 10%\rprogress 100%\n';
    const config = makeConfig({ collapseCarriageReturns: false });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe(text);
  });

  it('trims trailing spaces and tabs while preserving line endings', () => {
    // Arrange
    const text = 'first  \nsecond\t\t\nthird   ';
    const config = makeConfig({ trimTrailingWhitespace: true });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('first\nsecond\nthird');
  });

  it('keeps trailing whitespace when disabled', () => {
    // Arrange
    const text = 'first  \nsecond\t';
    const config = makeConfig({ trimTrailingWhitespace: false });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe(text);
  });

  it('preserves CRLF and CR endings when trimming trailing whitespace', () => {
    // Arrange
    const text = 'first  \r\nsecond\t\rthird  \r';
    const config = makeConfig({ trimTrailingWhitespace: true });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('first\r\nsecond\rthird\r');
  });

  it('can apply all cleanup operations together', () => {
    // Arrange
    const text = '\u001B[32mold\u001B[0m\r\u001B[31mnew\u001B[0m  \n';
    const config = makeConfig({
      stripAnsi: true,
      collapseCarriageReturns: true,
      trimTrailingWhitespace: true,
    });

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('new\n');
  });
});

function makeConfig(overrides: Partial<Parameters<typeof cleanTerminalOutput>[1]>) {
  return {
    stripAnsi: false,
    collapseCarriageReturns: false,
    trimTrailingWhitespace: false,
    ...overrides,
  };
}
