import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('loads defaults when no config files exist', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      glob: { enabled: true, defaultLimit: 100 },
    });
  });

  it('merges global config before project config so project values override global values', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(homeDir, JSON.stringify({ glob: { enabled: false, defaultLimit: 50 } }));
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ glob: { defaultLimit: 200 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      glob: { enabled: false, defaultLimit: 200 },
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
        glob: { enabled: 'yes', defaultLimit: 1001 },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual({
      enabled: true,
      glob: { enabled: true, defaultLimit: 100 },
    });
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid glob.enabled value'),
      expect.stringContaining('invalid glob.defaultLimit value'),
    ]);
  });

  it('parses jsonc comments and trailing commas', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      `{
        // Change only the default glob limit.
        "glob": { "defaultLimit": 250, },
      }`
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.glob.defaultLimit).toBe(250);
  });
});

async function importConfigWithHome(homeDir: string) {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return import('#pi-toolbox/config/config.js');
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-toolbox-test-'));
}

function writeGlobalConfig(homeDir: string, contents: string) {
  const configDir = path.join(homeDir, '.pi', 'agent');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-toolbox.jsonc'), contents);
}

function writeProjectConfig(cwd: string, contents: string) {
  const configDir = path.join(cwd, '.pi');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-toolbox.jsonc'), contents);
}
