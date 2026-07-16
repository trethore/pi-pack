import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  importConfigWithHome,
  makeTempDir,
  writeGlobalConfig,
  writeProjectConfig,
} from '#test/utils/config-test-helpers.js';

const TOOLBOX_DEFAULT_CONFIG = {
  enabled: true,
  applyPatch: { enabled: true },
  findFiles: { enabled: true, defaultLimit: 100 },
  grep: { enabled: true, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
};

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('loads defaults when no config files exist', async () => {
    const loaded = await loadToolboxConfigFromEmptyProject();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual(TOOLBOX_DEFAULT_CONFIG);
  });

  it('merges global config before project config so project values override global values', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(
      homeDir,
      JSON.stringify({
        applyPatch: { enabled: false },
        findFiles: { enabled: false, defaultLimit: 50 },
        grep: { defaultLimit: 25, defaultLimitPerFile: 3 },
      })
    );
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        grep: { defaultLimit: 300, defaultMaxCharsPerMatch: 500 },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      applyPatch: { enabled: false },
      findFiles: { enabled: false, defaultLimit: 50 },
      grep: {
        enabled: true,
        defaultLimit: 300,
        defaultLimitPerFile: 3,
        defaultMaxCharsPerMatch: 500,
      },
    });
  });

  it('keeps defaults and reports errors for invalid field values', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        enabled: 'yes',
        applyPatch: { enabled: 'yes' },
        findFiles: { enabled: 'yes', defaultLimit: 1001 },
        grep: {
          enabled: 'yes',
          defaultLimit: 0,
          defaultLimitPerFile: 1001,
          defaultMaxCharsPerMatch: 99,
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual(TOOLBOX_DEFAULT_CONFIG);
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid applyPatch.enabled value'),
      expect.stringContaining('invalid findFiles.enabled value'),
      expect.stringContaining('invalid findFiles.defaultLimit value'),
      expect.stringContaining('invalid grep.enabled value'),
      expect.stringContaining('invalid grep.defaultLimit value'),
      expect.stringContaining('invalid grep.defaultLimitPerFile value'),
      expect.stringContaining('invalid grep.defaultMaxCharsPerMatch value'),
    ]);
  });

  it('parses jsonc comments and trailing commas', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      `{
        // Change only the default find_files limit.
        "findFiles": { "defaultLimit": 250, },
      }`
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.findFiles.defaultLimit).toBe(250);
  });
});

async function loadToolboxConfigFromEmptyProject() {
  const { loadConfig } = await importConfigWithHome(makeTempDir());
  return loadConfig(makeTempDir());
}
