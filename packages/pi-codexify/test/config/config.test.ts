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
      codex: { enabled: true },
      usage: { enabled: true },
      account: { enabled: true },
      webSearch: { enabled: true },
    });
  });

  it('merges global config before project config so project values override global values', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(
      homeDir,
      JSON.stringify({
        codex: { verbosity: 'low', reasoningSummary: 'concise' },
        usage: { enabled: false },
        account: { enabled: false },
        webSearch: { enabled: false },
      })
    );
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        codex: { verbosity: 'high' },
        account: { enabled: true },
        webSearch: { enabled: true },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config).toEqual({
      enabled: true,
      codex: { enabled: true, verbosity: 'high', reasoningSummary: 'concise' },
      usage: { enabled: false },
      account: { enabled: true },
      webSearch: { enabled: true },
    });
  });

  it('uses null codex control values to disable inherited verbosity and reasoning summary', async () => {
    // Arrange
    const homeDir = makeTempDir();
    writeGlobalConfig(
      homeDir,
      JSON.stringify({ codex: { verbosity: 'medium', reasoningSummary: 'detailed' } })
    );
    const { loadConfig } = await importConfigWithHome(homeDir);
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ codex: { verbosity: null, reasoningSummary: null } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.codex).toEqual({ enabled: true });
  });

  it('keeps defaults and reports errors for invalid field values', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        enabled: 'yes',
        codex: { enabled: 'yes', verbosity: 'verbose', reasoningSummary: 'long' },
        usage: { enabled: 'no' },
        account: { enabled: 'yes' },
        webSearch: { enabled: 'yes' },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config).toEqual({
      enabled: true,
      codex: { enabled: true },
      usage: { enabled: true },
      account: { enabled: true },
      webSearch: { enabled: true },
    });
    expect(loaded.errors).toHaveLength(7);
    expect(loaded.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid codex.enabled value'),
      expect.stringContaining('invalid codex.verbosity value'),
      expect.stringContaining('invalid codex.reasoningSummary value'),
      expect.stringContaining('invalid usage.enabled value'),
      expect.stringContaining('invalid account.enabled value'),
      expect.stringContaining('invalid webSearch.enabled value'),
    ]);
  });

  it('parses jsonc comments and trailing commas', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithHome(makeTempDir());
    const cwd = makeTempDir();
    writeProjectConfig(
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

async function importConfigWithHome(homeDir: string) {
  vi.resetModules();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return import('#pi-codexify/config/config.js');
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-codexify-test-'));
}

function writeGlobalConfig(homeDir: string, contents: string) {
  const configDir = path.join(homeDir, '.pi', 'agent');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-codexify.jsonc'), contents);
}

function writeProjectConfig(cwd: string, contents: string) {
  const configDir = path.join(cwd, '.pi');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-codexify.jsonc'), contents);
}
