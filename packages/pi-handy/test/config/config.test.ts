import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const globalConfigPath = path.join(tmpdir(), 'pi-handy-global.jsonc');

vi.mock('#pi-handy/config/locations.js', () => ({
  GLOBAL_CONFIG_PATH: globalConfigPath,
  PROJECT_CONFIG_PATH: path.join(process.cwd(), '.pi', 'pi-handy.jsonc'),
  getConfigPaths: (cwd: string) => [globalConfigPath, path.join(cwd, '.pi', 'pi-handy.jsonc')],
}));

const { loadConfig } = await import('#pi-handy/config/config.js');

describe('pi-handy config', () => {
  beforeEach(() => {
    rmSync(globalConfigPath, { force: true });
  });

  it('uses defaults when no config files exist', () => {
    const cwd = makeTempProject();

    expect(loadConfig(cwd)).toEqual({
      config: {
        enabled: true,
        thinkingLevel: { enabled: true },
        switchWorkspace: { enabled: true },
        showSysprompt: { enabled: true },
      },
      errors: [],
    });
  });

  it('lets project config override global config', () => {
    const cwd = makeTempProject();
    writeFileSync(
      globalConfigPath,
      '{ "enabled": false, "thinkingLevel": { "enabled": false }, "switchWorkspace": { "enabled": false }, "showSysprompt": { "enabled": false } }'
    );
    writeProjectConfig(cwd, '{ "enabled": true, "switchWorkspace": { "enabled": true } }');

    expect(loadConfig(cwd).config).toEqual({
      enabled: true,
      thinkingLevel: { enabled: false },
      switchWorkspace: { enabled: true },
      showSysprompt: { enabled: false },
    });
  });

  it('reports invalid fields and keeps previous values', () => {
    const cwd = makeTempProject();
    writeProjectConfig(
      cwd,
      '{ "enabled": "yes", "thinkingLevel": false, "switchWorkspace": false, "showSysprompt": false }'
    );

    const result = loadConfig(cwd);

    expect(result.config).toEqual({
      enabled: true,
      thinkingLevel: { enabled: true },
      switchWorkspace: { enabled: true },
      showSysprompt: { enabled: true },
    });
    expect(result.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid thinkingLevel value'),
      expect.stringContaining('invalid switchWorkspace value'),
      expect.stringContaining('invalid showSysprompt value'),
    ]);
  });
});

function makeTempProject(): string {
  return path.join(tmpdir(), `pi-handy-test-${randomUUID()}`);
}

function writeProjectConfig(cwd: string, contents: string): void {
  const configDirectory = path.join(cwd, '.pi');
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(path.join(configDirectory, 'pi-handy.jsonc'), contents);
}
