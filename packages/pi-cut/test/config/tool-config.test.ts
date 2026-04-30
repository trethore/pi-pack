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
    expect(config.terminalCleanup.enabled).toBe(false);
    expect(config.repetitionFolding.enabled).toBe(true);
    expect(config.repetitionFolding.line.enabled).toBe(true);
    expect(config.repetitionFolding.block.enabled).toBe(true);
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
            block: { enabled: true, minLines: 3, minRepeats: 5 },
          },
          lineTruncation: { enabled: true, maxChars: 10 },
        },
      ],
    };
    const toolName = 'write';

    // Act
    const config = resolveToolConfig(configWithOverride, toolName);

    // Assert
    expect(config.terminalCleanup.enabled).toBe(true);
    expect(config.terminalCleanup.trimTrailingWhitespace).toBe(false);
    expect(config.repetitionFolding.enabled).toBe(true);
    expect(config.repetitionFolding.block).toEqual({ enabled: true, minLines: 3, minRepeats: 5 });
    expect(config.lineTruncation).toEqual({ enabled: true, maxChars: 10 });
  });
});
