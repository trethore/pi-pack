import { describe, expect, it } from 'vitest';
import { MAX_FOLDING_LINES, foldRepeatedOutput } from '#pi-cut/features/repetition-folding/fold-repeated-output.js';

const defaultConfig = {
  enabled: true,
  minRepeats: 2,
  minSavedLines: 3,
  minSavedTokens: 40,
  savingsMode: 'or' as const,
};

describe('foldRepeatedOutput', () => {
  it('folds repeated segments when they save enough lines', () => {
    // Arrange
    const firstLine = `${'a'.repeat(30)}\n`;
    const secondLine = `${'b'.repeat(30)}\n`;
    const text = `${firstLine}${secondLine}`.repeat(3);

    // Act
    const foldedText = foldRepeatedOutput(text, defaultConfig);

    // Assert
    expect(foldedText).toBe(`${firstLine}${secondLine}[previous block of 2 lines repeated x2]\n`);
  });

  it('does not fold short repeated segments below the default savings thresholds', () => {
    // Arrange
    const text = 'a\nb\na\nb\n';

    // Act
    const foldedText = foldRepeatedOutput(text, defaultConfig);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('folds long duplicate lines when they save enough estimated tokens', () => {
    // Arrange
    const line = `${'x'.repeat(220)}\n`;
    const text = line.repeat(2);

    // Act
    const foldedText = foldRepeatedOutput(text, defaultConfig);

    // Assert
    expect(foldedText).toBe(`${line}[previous line repeated x1]\n`);
  });

  it('requires all enabled savings checks in and mode', () => {
    // Arrange
    const text = 'a\nb\na\nb\na\nb\n';
    const config = { ...defaultConfig, savingsMode: 'and' as const };

    // Act
    const foldedText = foldRepeatedOutput(text, config);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('disables a savings check when its configured minimum is zero or less', () => {
    // Arrange
    const line = `${'x'.repeat(220)}\n`;
    const text = line.repeat(2);
    const config = { ...defaultConfig, minSavedLines: -1, savingsMode: 'and' as const };

    // Act
    const foldedText = foldRepeatedOutput(text, config);

    // Assert
    expect(foldedText).toBe(`${line}[previous line repeated x1]\n`);
  });

  it('folds any token-saving repeat when all savings checks are disabled', () => {
    // Arrange
    const text = `${'abcdef'.repeat(20)}\n`.repeat(2);
    const config = { ...defaultConfig, minSavedLines: 0, minSavedTokens: 0 };

    // Act
    const foldedText = foldRepeatedOutput(text, config);

    // Assert
    expect(foldedText).toBe(`${'abcdef'.repeat(20)}\n[previous line repeated x1]\n`);
  });

  it('returns unchanged text when repetition folding is disabled', () => {
    // Arrange
    const text = 'a\nb\na\nb\na\nb\n';
    const config = { ...defaultConfig, enabled: false };

    // Act
    const foldedText = foldRepeatedOutput(text, config);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('skips folding above the safety line limit', () => {
    // Arrange
    const text = `${'same\n'.repeat(MAX_FOLDING_LINES)}same`;

    // Act
    const foldedText = foldRepeatedOutput(text, defaultConfig);

    // Assert
    expect(foldedText).toBe(text);
  });
});
