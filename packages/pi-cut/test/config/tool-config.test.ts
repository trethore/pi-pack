import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/schema.js';
import { resolveToolConfig } from '../../src/config/tool-config.js';

describe('resolveToolConfig', () => {
  it('enables all default strategies for regular tools except terminal cleanup', () => {
    const config = resolveToolConfig(defaultConfig, 'read');

    expect(config.enabled).toBe(true);
    expect(config.terminalCleanup.enabled).toBe(false);
    expect(config.duplicateLineFolding.enabled).toBe(true);
    expect(config.repeatedBlockFolding.enabled).toBe(true);
    expect(config.lineTruncation.enabled).toBe(true);
  });

  it('keeps terminal cleanup enabled for bash', () => {
    expect(resolveToolConfig(defaultConfig, 'bash').terminalCleanup.enabled).toBe(true);
  });

  it('disables folding and truncation strategies for edit and write', () => {
    for (const toolName of ['edit', 'write']) {
      const config = resolveToolConfig(defaultConfig, toolName);

      expect(config.duplicateLineFolding.enabled).toBe(false);
      expect(config.repeatedBlockFolding.enabled).toBe(false);
      expect(config.lineTruncation.enabled).toBe(false);
    }
  });

  it('applies matching tool overrides after default tool behavior', () => {
    const config = resolveToolConfig(
      {
        ...defaultConfig,
        tools: [
          {
            selector: /^write$/,
            repeatedBlockFolding: { enabled: true, minLines: 3 },
            lineTruncation: { enabled: true, maxChars: 10 },
          },
        ],
      },
      'write'
    );

    expect(config.repeatedBlockFolding).toEqual({ enabled: true, minLines: 3 });
    expect(config.lineTruncation).toEqual({ enabled: true, maxChars: 10 });
  });
});
