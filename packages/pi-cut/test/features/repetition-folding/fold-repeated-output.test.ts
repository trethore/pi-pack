import { describe, expect, it } from 'vitest';
import {
  MAX_FOLDING_LINES,
  foldRepeatedOutput,
} from '#pi-cut/features/repetition-folding/fold-repeated-output.js';

const defaultConfig = {
  enabled: true,
  line: { enabled: true, minRepeats: 3 },
  block: { enabled: true, minLines: 3, minRepeats: 2 },
};

describe('foldRepeatedOutput', () => {
  it('folds repeated blocks before duplicate lines', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\nx\nx\nx\n';

    // Act
    const foldedText = foldRepeatedOutput(text, defaultConfig);

    // Assert
    expect(foldedText).toBe(
      'a\nb\nc\n[previous block of 3 lines repeated x1]\nx\n[previous line repeated x2]\n'
    );
  });

  it('returns unchanged text when repetition folding is disabled', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\nx\nx\nx\n';
    const config = {
      enabled: false,
      line: { enabled: true, minRepeats: 3 },
      block: { enabled: true, minLines: 3, minRepeats: 2 },
    };

    // Act
    const foldedText = foldRepeatedOutput(text, config);

    // Assert
    expect(foldedText).toBe(text);
  });

  it('returns unchanged text when repetition folding children are disabled', () => {
    // Arrange
    const text = 'a\nb\nc\na\nb\nc\nx\nx\nx\n';
    const config = {
      enabled: true,
      line: { enabled: false, minRepeats: 3 },
      block: { enabled: false, minLines: 3, minRepeats: 2 },
    };

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
