import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const globalConfigPath = path.join(tmpdir(), 'pi-handy-global.jsonc');

vi.mock('#pi-handy/config/locations.js', () => ({
  GLOBAL_CONFIG_PATH: globalConfigPath,
  PROJECT_CONFIG_PATH: path.join(process.cwd(), '.pi', 'pi-handy.jsonc'),
  getHandyConfigPaths: (cwd: string) => [globalConfigPath, path.join(cwd, '.pi', 'pi-handy.jsonc')],
}));

const { loadConfig } = await import('#pi-handy/config/config.js');

describe('pi-handy config', () => {
  beforeEach(() => {
    rmSync(globalConfigPath, { force: true });
  });

  it('uses defaults when no config files exist', () => {
    // Arrange
    const projectDirectory = makeTempProject();

    // Act
    const loadedConfig = loadConfig(projectDirectory);

    // Assert
    expect(loadedConfig).toEqual({
      config: {
        enabled: true,
        thinkingLevel: { enabled: true },
        showSysprompt: { enabled: true },
        timeTaken: { enabled: true },
        websocketCacheTtl: { enabled: false, ttlMinutes: 30 },
      },
      errors: [],
    });
  });

  it('lets project config override global config', () => {
    // Arrange
    const projectDirectory = makeTempProject();
    writeFileSync(
      globalConfigPath,
      '{ "enabled": false, "thinkingLevel": { "enabled": false }, "showSysprompt": { "enabled": false }, "timeTaken": { "enabled": false } }'
    );
    writeProjectConfig(projectDirectory, '{ "enabled": true, "thinkingLevel": { "enabled": true } }');

    // Act
    const loadedConfig = loadConfig(projectDirectory);

    // Assert
    expect(loadedConfig.config).toEqual({
      enabled: true,
      thinkingLevel: { enabled: true },
      showSysprompt: { enabled: false },
      timeTaken: { enabled: false },
      websocketCacheTtl: { enabled: false, ttlMinutes: 30 },
    });
  });

  it('reports invalid fields and keeps previous values', () => {
    // Arrange
    const projectDirectory = makeTempProject();
    writeProjectConfig(
      projectDirectory,
      '{ "enabled": "yes", "thinkingLevel": false, "showSysprompt": false, "timeTaken": false }'
    );

    // Act
    const loadedConfig = loadConfig(projectDirectory);

    // Assert
    expect(loadedConfig.config).toEqual({
      enabled: true,
      thinkingLevel: { enabled: true },
      showSysprompt: { enabled: true },
      timeTaken: { enabled: true },
      websocketCacheTtl: { enabled: false, ttlMinutes: 30 },
    });
    expect(loadedConfig.errors).toEqual([
      expect.stringContaining('invalid enabled value'),
      expect.stringContaining('invalid thinkingLevel value'),
      expect.stringContaining('invalid showSysprompt value'),
      expect.stringContaining('invalid timeTaken value'),
    ]);
  });

  it('loads a valid WebSocket cache TTL and rejects an out-of-range value', () => {
    // Arrange
    const projectDirectory = makeTempProject();
    writeFileSync(globalConfigPath, '{ "websocketCacheTtl": { "enabled": true, "ttlMinutes": 30 } }');
    writeProjectConfig(projectDirectory, '{ "websocketCacheTtl": { "ttlMinutes": 60 } }');

    // Act
    const loadedConfig = loadConfig(projectDirectory);

    // Assert
    expect(loadedConfig.config.websocketCacheTtl).toEqual({ enabled: true, ttlMinutes: 30 });
    expect(loadedConfig.errors).toEqual([expect.stringContaining('invalid websocketCacheTtl.ttlMinutes value')]);
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
