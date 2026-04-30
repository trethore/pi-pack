import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('rejects repetition folding line minRepeats below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repetitionFolding: { line: { minRepeats: 1 } } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repetitionFolding.line.minRepeats).toBe(3);
    expect(loaded.errors).toEqual([
      expect.stringContaining('repetitionFolding.line.minRepeats value'),
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
      line: { enabled: true, minRepeats: 3 },
      block: { enabled: true, minLines: 4, minRepeats: 2 },
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

  it('loads efficiency reminder defaults', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.efficiencyReminder).toEqual({
      enabled: true,
      onEvery: 1,
      text: [
        '<system_reminder>',
        'Minimize tool output, file reads, and irrelevant context, retaining only the data necessary to complete the current task.',
        '</system_reminder>',
      ].join('\n'),
    });
  });

  it('merges efficiency reminder config', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        efficiencyReminder: {
          enabled: false,
          onEvery: 3,
          text: '<system_reminder>Short reminder.</system_reminder>',
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.efficiencyReminder).toEqual({
      enabled: false,
      onEvery: 3,
      text: '<system_reminder>Short reminder.</system_reminder>',
    });
  });

  it('keeps the default efficiency reminder text when text is omitted', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ efficiencyReminder: { onEvery: 2 } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.efficiencyReminder.onEvery).toBe(2);
    expect(loaded.config.efficiencyReminder.text).toContain('Minimize tool output');
  });

  it('rejects invalid efficiency reminder config values', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ efficiencyReminder: { onEvery: 0, text: '' } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.efficiencyReminder.onEvery).toBe(1);
    expect(loaded.config.efficiencyReminder.text).toContain('Minimize tool output');
    expect(loaded.errors).toEqual([
      expect.stringContaining('efficiencyReminder.onEvery value'),
      expect.stringContaining('efficiencyReminder.text value'),
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
          line: { enabled: false, minRepeats: 4 },
          block: { enabled: true, minLines: 3, minRepeats: 4 },
        },
      })
    );

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repetitionFolding).toEqual({
      enabled: false,
      line: { enabled: false, minRepeats: 4 },
      block: { enabled: true, minLines: 3, minRepeats: 4 },
    });
  });

  it('rejects repetition folding block minLines below 3', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repetitionFolding: { block: { minLines: 2 } } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repetitionFolding.block.minLines).toBe(4);
    expect(loaded.errors).toEqual([
      expect.stringContaining('repetitionFolding.block.minLines value'),
    ]);
  });

  it('rejects repetition folding block minRepeats below 2', async () => {
    // Arrange
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repetitionFolding: { block: { minRepeats: 1 } } }));

    // Act
    const loaded = loadConfig(cwd);

    // Assert
    expect(loaded.config.repetitionFolding.block.minRepeats).toBe(2);
    expect(loaded.errors).toEqual([
      expect.stringContaining('repetitionFolding.block.minRepeats value'),
    ]);
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
              line: { enabled: false },
              block: { enabled: true, minLines: 3, minRepeats: 5 },
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
      line: { enabled: false },
      block: { enabled: true, minLines: 3, minRepeats: 5 },
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
