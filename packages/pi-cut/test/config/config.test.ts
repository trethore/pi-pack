import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('rejects duplicate line folding minRepeats below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ duplicateLineFolding: { minRepeats: 1 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.duplicateLineFolding.minRepeats).toBe(3);
    expect(loaded.errors).toEqual([
      expect.stringContaining('duplicateLineFolding.minRepeats value'),
    ]);
  });

  it('rejects line truncation maxChars below 1', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ lineTruncation: { maxChars: 0 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.lineTruncation.maxChars).toBe(2000);
    expect(loaded.errors).toEqual([expect.stringContaining('lineTruncation.maxChars value')]);
  });

  it('loads repeated block folding defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repeatedBlockFolding).toEqual({
      enabled: true,
      minLines: 4,
      minRepeats: 2,
    });
  });

  it('merges project repeated block folding config', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({ repeatedBlockFolding: { enabled: false, minLines: 3, minRepeats: 4 } })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repeatedBlockFolding).toEqual({
      enabled: false,
      minLines: 3,
      minRepeats: 4,
    });
  });

  it('rejects repeated block folding minLines below 3', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repeatedBlockFolding: { minLines: 2 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repeatedBlockFolding.minLines).toBe(4);
    expect(loaded.errors).toEqual([expect.stringContaining('repeatedBlockFolding.minLines value')]);
  });

  it('rejects repeated block folding minRepeats below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repeatedBlockFolding: { minRepeats: 1 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repeatedBlockFolding.minRepeats).toBe(2);
    expect(loaded.errors).toEqual([
      expect.stringContaining('repeatedBlockFolding.minRepeats value'),
    ]);
  });

  it('loads repeated block folding tool overrides', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        tools: [
          {
            selector: 'write',
            repeatedBlockFolding: { enabled: true, minLines: 3, minRepeats: 5 },
          },
        ],
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.tools).toHaveLength(1);
    expect(loaded.config.tools[0].repeatedBlockFolding).toEqual({
      enabled: true,
      minLines: 3,
      minRepeats: 5,
    });
  });
});

async function importConfigWithEmptyHome() {
  vi.resetModules();
  const homeDir = makeTempDir();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return import('#pi-cut/config/config.js');
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-cut-test-'));
}

function writeProjectConfig(cwd: string, contents: string) {
  const configDir = path.join(cwd, '.pi');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-cut.jsonc'), contents);
}
