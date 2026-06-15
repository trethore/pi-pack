import { createConfigTestFileHelpers, importWithHome } from '@trethore/pi-shared/test/config-test-helpers.js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { makeTempDir, writeProjectConfig } = createConfigTestFileHelpers({
  configFileName: 'pi-cut.jsonc',
  tempPrefix: 'pi-cut-test-',
});

type LoadedPiCutConfig = Awaited<ReturnType<typeof loadProjectConfig>>['config'];

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it.each([
    {
      name: 'repetition folding minRepeats below 2',
      projectConfig: { repetitionFolding: { minRepeats: 1 } },
      getActual: (config: LoadedPiCutConfig) => config.repetitionFolding.minRepeats,
      expectedValue: 2,
      expectedError: 'repetitionFolding.minRepeats value',
    },
    {
      name: 'line truncation maxChars below 1',
      projectConfig: { lineTruncation: { maxChars: 0 } },
      getActual: (config: LoadedPiCutConfig) => config.lineTruncation.maxChars,
      expectedValue: 2000,
      expectedError: 'lineTruncation.maxChars value',
    },
    {
      name: 'new lines folding minNewLines below 2',
      projectConfig: { newLinesFolding: { minNewLines: 1 } },
      getActual: (config: LoadedPiCutConfig) => config.newLinesFolding.minNewLines,
      expectedValue: 10,
      expectedError: 'newLinesFolding.minNewLines value',
    },
    {
      name: 'new lines folding foldTo below 2',
      projectConfig: { newLinesFolding: { foldTo: 1 } },
      getActual: (config: LoadedPiCutConfig) => config.newLinesFolding.foldTo,
      expectedValue: 5,
      expectedError: 'newLinesFolding.foldTo value',
    },
  ])('rejects $name', async ({ projectConfig, getActual, expectedValue, expectedError }) => {
    // Arrange
    const loaded = await loadProjectConfig(projectConfig);

    // Assert
    expect(getActual(loaded.config)).toBe(expectedValue);
    expect(loaded.errors).toEqual([expect.stringContaining(expectedError)]);
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
    writeProjectConfig(cwd, JSON.stringify({ newLinesFolding: { enabled: false, minNewLines: 4, foldTo: 2 } }));

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
    expect(loaded.errors).toEqual([expect.stringContaining('terminalCleanup.trimTrailingWhitespace value')]);
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
  return importWithHome(makeTempDir(), () => import('#pi-cut/config/config.js'));
}

async function loadProjectConfig(projectConfig: object) {
  const { loadConfig } = await importConfigWithEmptyHome();
  const cwd = makeTempDir();
  writeProjectConfig(cwd, JSON.stringify(projectConfig));
  return loadConfig(cwd);
}
