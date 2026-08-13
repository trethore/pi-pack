import { resetConfigTestEnvironment } from '@trethore/shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it } from 'vitest';

import {
  importConfigWithHome,
  makeTempDir,
  writeGlobalConfig,
  writeProjectConfig,
} from '#test/utils/config-test-helpers.js';

const TOOLBOX_DEFAULT_CONFIG = {
  enabled: true,
  applyPatch: { enabled: true },
};

describe('loadConfig', () => {
  afterEach(resetConfigTestEnvironment);

  it('loads defaults when no config files exist', async () => {
    const loaded = await loadToolboxConfigFromEmptyProject();

    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual(TOOLBOX_DEFAULT_CONFIG);
  });

  it('merges global config before project config so project values override global values', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ enabled: false, applyPatch: { enabled: false } }));
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ enabled: true }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      applyPatch: { enabled: false },
    });
  });

  it('keeps defaults and reports errors for invalid field values', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ enabled: 'yes', applyPatch: { enabled: 'yes' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual(TOOLBOX_DEFAULT_CONFIG);
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid applyPatch.enabled value'),
    ]);
  });

  it('parses jsonc comments and trailing commas', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      `{
        // Disable apply_patch.
        "applyPatch": { "enabled": false, },
      }`
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.applyPatch.enabled).toBe(false);
  });
});

async function loadToolboxConfigFromEmptyProject() {
  const { loadConfig } = await importConfigWithHome(makeTempDir());
  return loadConfig(makeTempDir());
}
