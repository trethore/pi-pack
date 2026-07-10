import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#pi-cut/config/schema.js';
import { resolveToolConfig } from '#pi-cut/config/tool-config.js';

describe('resolveToolConfig', () => {
  it('enables all default strategies for regular tools except terminal cleanup', () => {
    // Arrange
    const toolName = 'read';

    // Act
    const config = resolveToolConfig(defaultConfig, toolName);

    // Assert
    expect(config.enabled).toBe(true);
    expect(config.transformErrors).toBe(false);
    expect(config.terminalCleanup.enabled).toBe(false);
    expect(config.repetitionFolding).toEqual({
      enabled: true,
      minRepeats: 2,
      minSavedLines: 3,
      minSavedTokens: 40,
      maxComparisons: 250_000,
      savingsMode: 'or',
    });
    expect(config.newLinesFolding).toEqual({
      enabled: true,
      minNewLines: 10,
      foldTo: 5,
    });
    expect(config.lineTruncation.enabled).toBe(true);
  });

  it('keeps terminal cleanup enabled for bash', () => {
    // Arrange
    const toolName = 'bash';

    // Act
    const config = resolveToolConfig(defaultConfig, toolName);

    // Assert
    expect(config.terminalCleanup.enabled).toBe(true);
    expect(config.terminalCleanup.trimTrailingWhitespace).toBe(true);
  });

  it('disables folding and truncation strategies for edit and write', () => {
    // Arrange
    const toolNames = ['edit', 'write'];

    // Act
    const configs = toolNames.map((toolName) => resolveToolConfig(defaultConfig, toolName));

    // Assert
    for (const config of configs) {
      expect(config.repetitionFolding.enabled).toBe(false);
      expect(config.newLinesFolding.enabled).toBe(false);
      expect(config.lineTruncation.enabled).toBe(false);
    }
  });

  it('applies matching tool overrides after default tool behavior', () => {
    // Arrange
    const configWithOverride = {
      ...defaultConfig,
      tools: [
        {
          selector: /^write$/,
          terminalCleanup: { enabled: true, trimTrailingWhitespace: false },
          repetitionFolding: {
            enabled: true,
            minRepeats: 5,
            minSavedLines: 0,
            maxComparisons: 1000,
            savingsMode: 'and' as const,
          },
          transformErrors: true,
          newLinesFolding: { enabled: true, minNewLines: 3, foldTo: 2 },
          lineTruncation: { enabled: true, maxChars: 10 },
        },
      ],
    };
    const toolName = 'write';

    // Act
    const config = resolveToolConfig(configWithOverride, toolName);

    // Assert
    expect(config.terminalCleanup.enabled).toBe(true);
    expect(config.transformErrors).toBe(true);
    expect(config.terminalCleanup.trimTrailingWhitespace).toBe(false);
    expect(config.repetitionFolding).toEqual({
      enabled: true,
      minRepeats: 5,
      minSavedLines: 0,
      minSavedTokens: 40,
      maxComparisons: 1000,
      savingsMode: 'and',
    });
    expect(config.newLinesFolding).toEqual({ enabled: true, minNewLines: 3, foldTo: 2 });
    expect(config.lineTruncation).toEqual({ enabled: true, maxChars: 10 });
  });
});
