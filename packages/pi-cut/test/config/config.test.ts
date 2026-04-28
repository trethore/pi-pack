import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadConfig', () => {
  afterEach(() => {
    vi.doUnmock('node:os');
    vi.resetModules();
  });

  it('loads repeated block folding defaults', async () => {
    const { loadConfig } = await importConfigWithEmptyHome();

    const loaded = loadConfig(makeTempDir());

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repeatedBlockFolding).toEqual({ enabled: true, minLines: 4 });
  });

  it('merges project repeated block folding config', async () => {
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({ repeatedBlockFolding: { enabled: false, minLines: 3 } })
    );

    const loaded = loadConfig(cwd);

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.repeatedBlockFolding).toEqual({ enabled: false, minLines: 3 });
  });

  it('rejects repeated block folding minLines below 3', async () => {
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(cwd, JSON.stringify({ repeatedBlockFolding: { minLines: 2 } }));

    const loaded = loadConfig(cwd);

    expect(loaded.config.repeatedBlockFolding.minLines).toBe(4);
    expect(loaded.errors).toEqual([expect.stringContaining('repeatedBlockFolding.minLines value')]);
  });

  it('loads repeated block folding tool overrides', async () => {
    const { loadConfig } = await importConfigWithEmptyHome();
    const cwd = makeTempDir();
    writeProjectConfig(
      cwd,
      JSON.stringify({
        tools: [
          {
            selector: 'write',
            repeatedBlockFolding: { enabled: true, minLines: 3 },
          },
        ],
      })
    );

    const loaded = loadConfig(cwd);

    expect(loaded.errors).toEqual([]);
    expect(loaded.config.tools).toHaveLength(1);
    expect(loaded.config.tools[0].repeatedBlockFolding).toEqual({ enabled: true, minLines: 3 });
  });
});

async function importConfigWithEmptyHome() {
  vi.resetModules();
  const homeDir = makeTempDir();
  vi.doMock('node:os', async (importOriginal) => ({
    ...(await importOriginal<typeof import('node:os')>()),
    homedir: () => homeDir,
  }));

  return import('../../src/config/config.js');
}

function makeTempDir(): string {
  return mkdtempSync(path.join(tmpdir(), 'pi-cut-test-'));
}

function writeProjectConfig(cwd: string, contents: string) {
  const configDir = path.join(cwd, '.pi');
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, 'pi-cut.jsonc'), contents);
}
