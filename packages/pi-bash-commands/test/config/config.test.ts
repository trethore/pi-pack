import {
  createConfigTestFileHelpers,
  importWithHome,
  resetConfigTestEnvironment,
} from '@trethore/shared/test/config-test-helpers.js';
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
    expect(loaded).toEqual({
      config: {
        enabled: true,
        builtIns: {
          'pi-find': { enabled: true, defaultLimit: 100 },
          'pi-grep': { enabled: true, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
        },
        commands: [],
      },
      errors: [],
    });
  });

  it.each([
    { value: true, expectedEnabled: { find: true, grep: true } },
    { value: false, expectedEnabled: { find: false, grep: false } },
    { value: { 'pi-grep': true }, expectedEnabled: { find: false, grep: true } },
    { value: { 'pi-find': true, 'pi-grep': false }, expectedEnabled: { find: true, grep: false } },
  ])('normalizes builtIns value $value', async ({ value, expectedEnabled }) => {
    // Arrange
    const projectConfig = { builtIns: value };

    // Act
    const loaded = await loadProjectConfig(projectConfig);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.builtIns).toEqual({
      'pi-find': { enabled: expectedEnabled.find, defaultLimit: 100 },
      'pi-grep': { enabled: expectedEnabled.grep, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
    });
  });

  it('loads built-in default settings and enables object entries by default', async () => {
    // Arrange
    const projectConfig = {
      builtIns: {
        'pi-find': { defaultLimit: 25 },
        'pi-grep': {
          enabled: true,
          defaultLimit: 50,
          defaultLimitPerFile: 3,
          defaultMaxCharsPerMatch: 500,
        },
      },
    };

    // Act
    const loaded = await loadProjectConfig(projectConfig);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.builtIns).toEqual({
      'pi-find': { enabled: true, defaultLimit: 25 },
      'pi-grep': {
        enabled: true,
        defaultLimit: 50,
        defaultLimitPerFile: 3,
        defaultMaxCharsPerMatch: 500,
      },
    });
  });

  it('replaces inherited built-in selection and settings with a project allowlist', async () => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ builtIns: { 'pi-find': { defaultLimit: 25 } } }));
    writeProjectConfig(cwd, JSON.stringify({ builtIns: { 'pi-grep': { defaultLimit: 50 } } }));
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.builtIns).toEqual({
      'pi-find': { enabled: false, defaultLimit: 100 },
      'pi-grep': { enabled: true, defaultLimit: 50, defaultMaxCharsPerMatch: 200 },
    });
  });

  it('reports invalid built-in selections while keeping valid entries', async () => {
    // Arrange
    const projectConfig = { builtIns: { 'pi-find': true, 'pi-grep': 'yes', unknown: true } };

    // Act
    const loaded = await loadProjectConfig(projectConfig);

    // Assert
    expect(loaded.config.builtIns).toEqual({
      'pi-find': { enabled: true, defaultLimit: 100 },
      'pi-grep': { enabled: false, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
    });
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid builtIns.pi-grep value'),
      expect.stringContaining('unknown built-in command "unknown"'),
    ]);
  });

  it('keeps built-in defaults while reporting invalid default settings', async () => {
    // Arrange
    const projectConfig = {
      builtIns: {
        'pi-find': { enabled: 'yes', defaultLimit: 0 },
        'pi-grep': {
          defaultLimit: 1001,
          defaultLimitPerFile: 0,
          defaultMaxCharsPerMatch: 99,
        },
      },
    };

    // Act
    const loaded = await loadProjectConfig(projectConfig);

    // Assert
    expect(loaded.config.builtIns).toEqual({
      'pi-find': { enabled: true, defaultLimit: 100 },
      'pi-grep': { enabled: true, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
    });
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid builtIns.pi-find.enabled value'),
      expect.stringContaining('invalid builtIns.pi-find.defaultLimit value'),
      expect.stringContaining('invalid builtIns.pi-grep.defaultLimit value'),
      expect.stringContaining('invalid builtIns.pi-grep.defaultLimitPerFile value'),
      expect.stringContaining('invalid builtIns.pi-grep.defaultMaxCharsPerMatch value'),
    ]);
  });

  it('normalizes command defaults and empty prompt metadata', async () => {
    // Arrange
    const projectConfig = {
      commands: [
        { name: 'example', command: process.execPath, prompt: { description: '  Run it.  ', usage: ' ' } },
        { name: 'situational', command: process.execPath, prompt: {} },
      ],
    };

    // Act
    const loaded = await loadProjectConfig(projectConfig);

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
    const projectConfig = {
      commands: [
        { name: 'valid', command: process.execPath },
        { name: 'relative', command: 'node' },
        { name: 'bad/name', command: process.execPath },
        { name: 'valid', command: process.execPath },
        { name: 'bad-env', command: process.execPath, env: { 'BAD-NAME': 'value' } },
        { name: 'pi-grep', command: process.execPath },
      ],
    };

    // Act
    const loaded = await loadProjectConfig(projectConfig);

    // Assert
    expect(loaded.config.commands.map((command) => command.name)).toEqual(['valid']);
    expect(loaded.errors).toHaveLength(5);
    expect(loaded.errors).toEqual([
      expect.stringContaining('command must be absolute'),
      expect.stringContaining('invalid commands[2]'),
      expect.stringContaining('duplicate enabled command name'),
      expect.stringContaining('invalid commands[4]'),
      expect.stringContaining('reserved built-in command name'),
    ]);
  });
});

async function importConfig(homeDir: string) {
  return importWithHome(homeDir, () => import('#pi-bash-commands/config/config.js'));
}

async function loadProjectConfig(projectConfig: unknown) {
  const homeDir = makeTempDir();
  const cwd = makeTempDir();
  writeProjectConfig(cwd, JSON.stringify(projectConfig));
  const { loadConfig } = await importConfig(homeDir);
  return loadConfig(cwd);
}
