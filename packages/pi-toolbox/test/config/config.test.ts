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
      findFiles: { enabled: true, defaultLimit: 100 },
      grep: { enabled: true, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
      customEdit: { enabled: true },
    });
  });

  it('merges global config before project config so project values override global values', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(
      homeDir,
      JSON.stringify({
        findFiles: { enabled: false, defaultLimit: 50 },
        grep: { defaultLimit: 25, defaultLimitPerFile: 3 },
        customEdit: { enabled: false },
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
      findFiles: { enabled: false, defaultLimit: 50 },
      grep: {
        enabled: true,
        defaultLimit: 300,
        defaultLimitPerFile: 3,
        defaultMaxCharsPerMatch: 500,
      },
      customEdit: { enabled: false },
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
        findFiles: { enabled: 'yes', defaultLimit: 1001 },
        grep: {
          enabled: 'yes',
          defaultLimit: 0,
          defaultLimitPerFile: 1001,
          defaultMaxCharsPerMatch: 99,
        },
        customEdit: { enabled: 'yes' },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual({
      enabled: true,
      findFiles: { enabled: true, defaultLimit: 100 },
      grep: { enabled: true, defaultLimit: 200, defaultMaxCharsPerMatch: 200 },
      customEdit: { enabled: true },
    });
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid findFiles.enabled value'),
      expect.stringContaining('invalid findFiles.defaultLimit value'),
      expect.stringContaining('invalid grep.enabled value'),
      expect.stringContaining('invalid grep.defaultLimit value'),
      expect.stringContaining('invalid grep.defaultLimitPerFile value'),
      expect.stringContaining('invalid grep.defaultMaxCharsPerMatch value'),
      expect.stringContaining('invalid customEdit.enabled value'),
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
