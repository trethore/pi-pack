import { describe, expect, it } from 'vitest';
import { cleanTerminalOutput } from '#pi-cut/features/terminal-cleanup/clean-terminal-output.js';

describe('cleanTerminalOutput', () => {
  it('strips ANSI escape sequences when enabled', () => {
    // Arrange
    const text = '\u001B[31mred\u001B[0m plain';
    const config = { stripAnsi: true, collapseCarriageReturns: false };

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('red plain');
  });

  it('keeps ANSI escape sequences when disabled', () => {
    // Arrange
    const text = '\u001B[31mred\u001B[0m';
    const config = { stripAnsi: false, collapseCarriageReturns: false };

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe(text);
  });

  it('collapses carriage-return redraws when enabled', () => {
    // Arrange
    const text = 'progress 10%\rprogress 100%\ndone\n';
    const config = { stripAnsi: false, collapseCarriageReturns: true };

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('progress 100%\ndone\n');
  });

  it('keeps carriage-return redraws when disabled', () => {
    // Arrange
    const text = 'progress 10%\rprogress 100%\n';
    const config = { stripAnsi: false, collapseCarriageReturns: false };

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe(text);
  });

  it('can apply both cleanup operations together', () => {
    // Arrange
    const text = '\u001B[32mold\u001B[0m\r\u001B[31mnew\u001B[0m\n';
    const config = { stripAnsi: true, collapseCarriageReturns: true };

    // Act
    const cleanedText = cleanTerminalOutput(text, config);

    // Assert
    expect(cleanedText).toBe('new\n');
  });
});
