import { resetConfigTestEnvironment } from '@trethore/pi-shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it } from 'vitest';

import * as configTest from '#test/utils/config-test-helpers.js';

const CODEXIFY_DEFAULT_CONFIG = {
  enabled: true,
  controls: { enabled: true, webSearch: true },
  usage: true,
  reset: true,
};

describe('loadConfig', () => {
  afterEach(resetConfigTestEnvironment);

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
        controls: {
          verbosity: 'low',
          reasoningSummary: 'concise',
          serviceTier: 'priority',
          webSearch: false,
        },
        usage: false,
        reset: false,
      })
    );
    const { loadConfig } = await configTest.importConfigWithHome(homeDir);
    const cwd = configTest.makeTempDir();
    configTest.writeProjectConfig(
      cwd,
      JSON.stringify({
        controls: { verbosity: 'high', webSearch: true },
        reset: true,
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      controls: {
        enabled: true,
        webSearch: true,
        verbosity: 'high',
        reasoningSummary: 'concise',
        serviceTier: 'priority',
      },
      usage: false,
      reset: true,
    });
  });

  it('does not load project config when project access is disabled', async () => {
    const homeDir = configTest.makeTempDir();
    configTest.writeGlobalConfig(homeDir, JSON.stringify({ controls: { verbosity: 'low' } }));
    const { loadConfig } = await configTest.importConfigWithHome(homeDir);
    const cwd = configTest.makeTempDir();
    configTest.writeProjectConfig(cwd, JSON.stringify({ controls: { verbosity: 'high' } }));

    const loaded = loadConfig(cwd, { includeProject: false });

    expect(loaded.config.controls.verbosity).toBe('low');
  });

  it('uses null codex control values to disable inherited verbosity, reasoning summary, and service tier', async () => {
    // Arrange
    const homeDir = configTest.makeTempDir();
    configTest.writeGlobalConfig(
      homeDir,
      JSON.stringify({ controls: { verbosity: 'medium', reasoningSummary: 'detailed', serviceTier: 'priority' } })
    );
    const { loadConfig } = await configTest.importConfigWithHome(homeDir);
    const cwd = configTest.makeTempDir();
    configTest.writeProjectConfig(
      cwd,
      JSON.stringify({ controls: { verbosity: null, reasoningSummary: null, serviceTier: null } })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.controls).toEqual({ enabled: true, webSearch: true });
  });

  it('loads none as a reasoning summary control value', async () => {
    // Arrange
    const { loadConfig, cwd } = await loadConfigAndProjectDir();
    configTest.writeProjectConfig(cwd, JSON.stringify({ controls: { reasoningSummary: 'none' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.controls).toEqual({ enabled: true, webSearch: true, reasoningSummary: 'none' });
  });

  it('keeps defaults and reports errors for invalid field values', async () => {
    // Arrange
    const { loadConfig, cwd } = await loadConfigAndProjectDir();
    configTest.writeProjectConfig(
      cwd,
      JSON.stringify({
        enabled: 'yes',
        controls: {
          enabled: 'yes',
          verbosity: 'verbose',
          reasoningSummary: 'long',
          serviceTier: 'fast',
          webSearch: 'yes',
        },
        usage: 'no',
        reset: 'yes',
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual(CODEXIFY_DEFAULT_CONFIG);
    expect(loaded.errors).toHaveLength(8);
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid usage value'),
      expect.stringContaining('invalid reset value'),
      expect.stringContaining('invalid controls.enabled value'),
      expect.stringContaining('invalid controls.webSearch value'),
      expect.stringContaining('invalid controls.verbosity value'),
      expect.stringContaining('invalid controls.reasoningSummary value'),
      expect.stringContaining('invalid controls.serviceTier value'),
    ]);
  });

  it('parses jsonc comments and trailing commas', async () => {
    // Arrange
    const { loadConfig, cwd } = await loadConfigAndProjectDir();
    configTest.writeProjectConfig(
      cwd,
      `{
        // Disable only the web search tool.
        "controls": { "webSearch": false, },
      }`
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.controls.webSearch).toBe(false);
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
