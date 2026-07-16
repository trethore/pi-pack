import { afterEach, describe, expect, it, vi } from 'vitest';

import * as configTest from '#test/utils/config-test-helpers.js';

const CODEXIFY_DEFAULT_CONFIG = {
  enabled: true,
  codex: { enabled: true },
  usage: { enabled: true },
  reset: { enabled: true },
  webSearch: { enabled: true },
};

describe('loadConfig', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('loads defaults when no config files exist', async () => {
    const loaded = await loadConfigForFreshProject();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual(CODEXIFY_DEFAULT_CONFIG);
  });

  it('merges global config before project config so project values override global values', async () => {
    // Arrange
    const homeDir = configTest.makeTempDir();
    configTest.writeGlobalConfig(
      homeDir,
      JSON.stringify({
        codex: { verbosity: 'low', reasoningSummary: 'concise', serviceTier: 'priority' },
        usage: { enabled: false },
        reset: { enabled: false },
        webSearch: { enabled: false },
      })
    );
    const { loadConfig } = await configTest.importConfigWithHome(homeDir);
    const cwd = configTest.makeTempDir();
    configTest.writeProjectConfig(
      cwd,
      JSON.stringify({
        codex: { verbosity: 'high' },
        reset: { enabled: true },
        webSearch: { enabled: true },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      codex: { enabled: true, verbosity: 'high', reasoningSummary: 'concise', serviceTier: 'priority' },
      usage: { enabled: false },
      reset: { enabled: true },
      webSearch: { enabled: true },
    });
  });

  it('does not load project config when project access is disabled', async () => {
    const homeDir = configTest.makeTempDir();
    configTest.writeGlobalConfig(homeDir, JSON.stringify({ codex: { verbosity: 'low' } }));
    const { loadConfig } = await configTest.importConfigWithHome(homeDir);
    const cwd = configTest.makeTempDir();
    configTest.writeProjectConfig(cwd, JSON.stringify({ codex: { verbosity: 'high' } }));

    const loaded = loadConfig(cwd, { includeProject: false });

    expect(loaded.config.codex.verbosity).toBe('low');
  });

  it('uses null codex control values to disable inherited verbosity, reasoning summary, and service tier', async () => {
    // Arrange
    const homeDir = configTest.makeTempDir();
    configTest.writeGlobalConfig(
      homeDir,
      JSON.stringify({ codex: { verbosity: 'medium', reasoningSummary: 'detailed', serviceTier: 'priority' } })
    );
    const { loadConfig } = await configTest.importConfigWithHome(homeDir);
    const cwd = configTest.makeTempDir();
    configTest.writeProjectConfig(
      cwd,
      JSON.stringify({ codex: { verbosity: null, reasoningSummary: null, serviceTier: null } })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.codex).toEqual({ enabled: true });
  });

  it('loads none as a reasoning summary control value', async () => {
    // Arrange
    const { loadConfig, cwd } = await loadConfigAndProjectDir();
    configTest.writeProjectConfig(cwd, JSON.stringify({ codex: { reasoningSummary: 'none' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.codex).toEqual({ enabled: true, reasoningSummary: 'none' });
  });

  it('keeps defaults and reports errors for invalid field values', async () => {
    // Arrange
    const { loadConfig, cwd } = await loadConfigAndProjectDir();
    configTest.writeProjectConfig(
      cwd,
      JSON.stringify({
        enabled: 'yes',
        codex: { enabled: 'yes', verbosity: 'verbose', reasoningSummary: 'long', serviceTier: 'fast' },
        usage: { enabled: 'no' },
        reset: { enabled: 'yes' },
        webSearch: { enabled: 'yes' },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual(CODEXIFY_DEFAULT_CONFIG);
    expect(loaded.errors).toHaveLength(8);
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid codex.enabled value'),
      expect.stringContaining('invalid codex.verbosity value'),
      expect.stringContaining('invalid codex.reasoningSummary value'),
      expect.stringContaining('invalid codex.serviceTier value'),
      expect.stringContaining('invalid usage.enabled value'),
      expect.stringContaining('invalid reset.enabled value'),
      expect.stringContaining('invalid webSearch.enabled value'),
    ]);
  });

  it('parses jsonc comments and trailing commas', async () => {
    // Arrange
    const { loadConfig, cwd } = await loadConfigAndProjectDir();
    configTest.writeProjectConfig(
      cwd,
      `{
        // Disable only the web search tool.
        "webSearch": { "enabled": false, },
      }`
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.webSearch.enabled).toBe(false);
  });
});

async function loadConfigForFreshProject() {
  const { loadConfig, cwd } = await loadConfigAndProjectDir();
  return loadConfig(cwd);
}

async function loadConfigAndProjectDir() {
  const { loadConfig } = await configTest.importConfigWithHome(configTest.makeTempDir());
  return { loadConfig, cwd: configTest.makeTempDir() };
}
