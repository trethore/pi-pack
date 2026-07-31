import {
  createConfigTestFileHelpers,
  importWithHome,
  resetConfigTestEnvironment,
} from '@trethore/pi-shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it } from 'vitest';

const { makeTempDir, writeGlobalConfig, writeProjectConfig } = createConfigTestFileHelpers({
  configFileName: 'pi-bash-commands.jsonc',
  tempPrefix: 'pi-bash-commands-config-test-',
});

describe('loadConfig', () => {
  afterEach(resetConfigTestEnvironment);

  it('loads defaults without configuration files', async () => {
    // Arrange
    const { loadConfig } = await importConfig(makeTempDir());

    // Act
    const loaded = loadConfig(makeTempDir());

    // Assert
    expect(loaded).toEqual({ config: { enabled: true, commands: [] }, errors: [] });
  });

  it('normalizes command defaults and empty prompt metadata', async () => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        commands: [
          { name: 'example', command: process.execPath, prompt: { description: '  Run it.  ', usage: ' ' } },
          { name: 'situational', command: process.execPath, prompt: {} },
        ],
      })
    );
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.commands).toEqual([
      {
        enabled: true,
        name: 'example',
        command: process.execPath,
        args: [],
        env: {},
        prompt: { description: 'Run it.', usage: undefined },
      },
      {
        enabled: true,
        name: 'situational',
        command: process.execPath,
        args: [],
        env: {},
        prompt: undefined,
      },
    ]);
  });

  it('replaces global commands with project commands', async () => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ commands: [{ name: 'global', command: process.execPath }] }));
    writeProjectConfig(cwd, JSON.stringify({ commands: [{ name: 'project', command: process.execPath }] }));
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);
    const globalOnly = loadConfig(cwd, { includeProject: false });

    // Assert
    expect(loaded.config.commands.map((command) => command.name)).toEqual(['project']);
    expect(globalOnly.config.commands.map((command) => command.name)).toEqual(['global']);
  });

  it('keeps valid entries while reporting invalid entries', async () => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        commands: [
          { name: 'valid', command: process.execPath },
          { name: 'relative', command: 'node' },
          { name: 'bad/name', command: process.execPath },
          { name: 'valid', command: process.execPath },
          { name: 'bad-env', command: process.execPath, env: { 'BAD-NAME': 'value' } },
        ],
      })
    );
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.commands.map((command) => command.name)).toEqual(['valid']);
    expect(loaded.errors).toHaveLength(4);
    expect(loaded.errors).toEqual([
      expect.stringContaining('command must be absolute'),
      expect.stringContaining('invalid commands[2]'),
      expect.stringContaining('duplicate enabled command name'),
      expect.stringContaining('invalid commands[4]'),
    ]);
  });
});

async function importConfig(homeDir: string) {
  return importWithHome(homeDir, () => import('#pi-bash-commands/config/config.js'));
}
