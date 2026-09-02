import { resetConfigTestEnvironment } from '@trethore/shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it } from 'vitest';

import { importConfigWithHome, makeTempDir, writeGlobalConfig, writeProjectConfig } from '#test/utils/config.js';

const DEFAULT_CONFIG = {
  enabled: true,
  message: 'Ready for input',
  cooldown: 90,
  unfocusedOnly: false,
  protocol: 'auto',
};

describe('pi-notify config', () => {
  afterEach(resetConfigTestEnvironment);

  it('loads defaults when no config files exist', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());

    // Act
    const loaded = loadConfig(makeTempDir());

    // Assert
    expect(loaded).toEqual({ config: DEFAULT_CONFIG, errors: [] });
  });

  it('merges global config before project config', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(
      homeDir,
      JSON.stringify({ enabled: false, message: 'Global', cooldown: 30, unfocusedOnly: true, protocol: 'osc9' })
    );
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ enabled: true, message: 'Project', protocol: 'osc99' }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      message: 'Project',
      cooldown: 30,
      unfocusedOnly: true,
      protocol: 'osc99',
    });
  });

  it('reports invalid values and keeps defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({ enabled: 'yes', message: 1, cooldown: -1, unfocusedOnly: 'yes', protocol: 'osc8' })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual(DEFAULT_CONFIG);
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid message value'),
      expect.stringContaining('invalid cooldown value'),
      expect.stringContaining('invalid unfocusedOnly value'),
      expect.stringContaining('invalid protocol value'),
    ]);
  });

  it('can exclude project configuration', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ message: 'Global' }));
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ message: 'Project' }));

    // Act
    const loaded = loadConfig(cwd, { includeProject: false });

    // Assert
    expect(loaded.config.message).toBe('Global');
  });
});
