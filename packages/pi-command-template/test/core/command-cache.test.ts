import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import { CommandCache } from '#src/core/command-cache.js';

describe('CommandCache', () => {
  it('runs a command once and reuses the cached output', () => {
    const cache = new CommandCache({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, shell: false },
        templates: { node: 'node --version' },
      },
      workspaceCwd: process.cwd(),
      extensionCwd: process.cwd(),
    });

    const firstOutput = cache.getOutput('node');
    const secondOutput = cache.getOutput('node');

    expect(firstOutput).toBe(secondOutput);
    expect(firstOutput).toMatch(/^v\d+/);
  });
});
