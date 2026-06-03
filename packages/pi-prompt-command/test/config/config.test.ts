import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('loads conservative surface defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.surfaces).toEqual({
      system: true,
      appendSystem: true,
      promptTemplates: true,
      contextFiles: false,
      skills: false,
    });
    expect(loaded.config.permissions).toEqual({ '*': 'deny' });
  });

  it('merges project permissions and surfaces', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        surfaces: { contextFiles: true, appendSystem: false },
        permissions: { '*': 'deny', 'git *': 'allow', 'git push *': 'deny' },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.surfaces.contextFiles).toBe(true);
    expect(loaded.config.surfaces.appendSystem).toBe(false);
    expect(loaded.config.permissions).toEqual({
      '*': 'deny',
      'git *': 'allow',
      'git push *': 'deny',
    });
  });

  it('rejects invalid permission decisions', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ permissions: { 'git *': 'ask' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.permissions).toEqual({});
    expect(loaded.errors).toEqual([expect.stringContaining('permissions.git * value')]);
  });
});

async function importConfigWithEmptyHome() {
  vi.resetModules();
  const homeDir = makeTempDir();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return import('#pi-prompt-command/config/config.js');
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-prompt-command-test-'));
}

function writeProjectConfig(cwd: string, contents: string) {
  const configDir = path.join(cwd, '.pi');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-prompt-command.jsonc'), contents);
}
