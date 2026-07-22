import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import { CommandCache } from '#src/core/command-cache.js';

describe('CommandCache', () => {
  it('runs a command once and reuses the cached output', () => {
    // Arrange
    const cache = new CommandCache({
      config: {
        ...defaultConfig,
        templates: { node: ['node', '--version'] },
      },
      workspaceCwd: process.cwd(),
      extensionCwd: process.cwd(),
    });

    // Act
    const firstOutput = cache.getOutput('node');
    const secondOutput = cache.getOutput('node');

    // Assert
    expect(firstOutput).toBe(secondOutput);
    expect(firstOutput).toMatch(/^v\d+/);
  });
});
