import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('rejects repetition folding minRepeats below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repetitionFolding: { minRepeats: 1 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repetitionFolding.minRepeats).toBe(2);
    expect(loaded.errors).toEqual([expect.stringContaining('repetitionFolding.minRepeats value')]);
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

  it('rejects new lines folding minNewLines below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ newLinesFolding: { minNewLines: 1 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.newLinesFolding.minNewLines).toBe(10);
    expect(loaded.errors).toEqual([expect.stringContaining('newLinesFolding.minNewLines value')]);
  });

  it('rejects new lines folding foldTo below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ newLinesFolding: { foldTo: 1 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.newLinesFolding.foldTo).toBe(5);
    expect(loaded.errors).toEqual([expect.stringContaining('newLinesFolding.foldTo value')]);
  });

  it('rejects new lines folding foldTo above minNewLines', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ newLinesFolding: { minNewLines: 3, foldTo: 4 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.newLinesFolding).toEqual({ enabled: true, minNewLines: 10, foldTo: 5 });
    expect(loaded.errors).toEqual([expect.stringContaining('foldTo <= minNewLines')]);
  });

  it('loads repetition folding defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repetitionFolding).toEqual({
      enabled: true,
      minRepeats: 2,
      minSavedLines: 3,
      minSavedTokens: 40,
      savingsMode: 'or',
    });
  });

  it('loads new lines folding defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.newLinesFolding).toEqual({
      enabled: true,
      minNewLines: 10,
      foldTo: 5,
    });
  });

  it('loads terminal cleanup defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.terminalCleanup).toEqual({
      enabled: true,
      stripAnsi: true,
      collapseCarriageReturns: true,
      trimTrailingWhitespace: true,
    });
  });

  it('merges terminal cleanup trimTrailingWhitespace config', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ terminalCleanup: { trimTrailingWhitespace: false } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.terminalCleanup.trimTrailingWhitespace).toBe(false);
  });

  it('merges project new lines folding config', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({ newLinesFolding: { enabled: false, minNewLines: 4, foldTo: 2 } })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.newLinesFolding).toEqual({
      enabled: false,
      minNewLines: 4,
      foldTo: 2,
    });
  });

  it('rejects invalid terminal cleanup trimTrailingWhitespace values', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ terminalCleanup: { trimTrailingWhitespace: 'no' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.terminalCleanup.trimTrailingWhitespace).toBe(true);
    expect(loaded.errors).toEqual([
      expect.stringContaining('terminalCleanup.trimTrailingWhitespace value'),
    ]);
  });

  it('merges project repetition folding config', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        repetitionFolding: {
          enabled: false,
          minRepeats: 4,
          minSavedLines: 0,
          minSavedTokens: -1,
          savingsMode: 'and',
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repetitionFolding).toEqual({
      enabled: false,
      minRepeats: 4,
      minSavedLines: 0,
      minSavedTokens: -1,
      savingsMode: 'and',
    });
  });

  it('rejects invalid repetition folding savingsMode', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repetitionFolding: { savingsMode: 'xor' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repetitionFolding.savingsMode).toBe('or');
    expect(loaded.errors).toEqual([expect.stringContaining('repetitionFolding.savingsMode value')]);
  });

  it('loads new lines folding tool overrides', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        tools: [
          {
            selector: 'write',
            newLinesFolding: {
              enabled: true,
              minNewLines: 3,
              foldTo: 2,
            },
          },
        ],
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.tools).toHaveLength(1);
    expect(loaded.config.tools[0].newLinesFolding).toEqual({
      enabled: true,
      minNewLines: 3,
      foldTo: 2,
    });
  });

  it('loads repetition folding tool overrides', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        tools: [
          {
            selector: 'write',
            repetitionFolding: {
              enabled: true,
              minRepeats: 5,
              minSavedLines: 0,
              savingsMode: 'and',
            },
          },
        ],
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.tools).toHaveLength(1);
    expect(loaded.config.tools[0].repetitionFolding).toEqual({
      enabled: true,
      minRepeats: 5,
      minSavedLines: 0,
      savingsMode: 'and',
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
