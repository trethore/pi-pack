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
    expect(loaded).toEqual({
      config: {
        enabled: true,
        builtIns: { 'pi-find': true, 'pi-grep': true },
        commands: [],
      },
      errors: [],
    });
  });

  it.each([
    { value: true, expected: { 'pi-find': true, 'pi-grep': true } },
    { value: false, expected: { 'pi-find': false, 'pi-grep': false } },
    { value: { 'pi-grep': true }, expected: { 'pi-find': false, 'pi-grep': true } },
    { value: { 'pi-find': true, 'pi-grep': false }, expected: { 'pi-find': true, 'pi-grep': false } },
  ])('normalizes builtIns value $value', async ({ value, expected }) => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ builtIns: value }));
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.builtIns).toEqual(expected);
  });

  it('replaces the inherited built-in selection with a project allowlist', async () => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ builtIns: { 'pi-find': true } }));
    writeProjectConfig(cwd, JSON.stringify({ builtIns: { 'pi-grep': true } }));
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.builtIns).toEqual({ 'pi-find': false, 'pi-grep': true });
  });

  it('reports invalid built-in selections while keeping valid entries', async () => {
    // Arrange
    const homeDir = makeTempDir();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ builtIns: { 'pi-find': true, 'pi-grep': 'yes', unknown: true } }));
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.builtIns).toEqual({ 'pi-find': true, 'pi-grep': false });
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid builtIns.pi-grep value'),
      expect.stringContaining('unknown built-in command "unknown"'),
    ]);
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
          { name: 'pi-grep', command: process.execPath },
        ],
      })
    );
    const { loadConfig } = await importConfig(homeDir);

    // Act
    const loaded = loadConfig(cwd);

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
