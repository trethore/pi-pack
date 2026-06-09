import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '#pi-codeact/config/config.js';

function createWorkspace(config: string): string {
  const workspace = mkdtempSync(path.join(tmpdir(), 'pi-codeact-config-'));
  const configDirectory = path.join(workspace, '.pi');
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(path.join(configDirectory, 'pi-codeact.jsonc'), config);
  return workspace;
}

describe('loadConfig', () => {
  it('merges partial project config with defaults', () => {
    const workspace = createWorkspace(`{
      "executeCode": {
        "packageCachePath": "./.cache/codeact",
        "defaultTimeoutSeconds": 12
      }
    }`);

    const loadedConfig = loadConfig(workspace);

    expect(loadedConfig.config.enabled).toBe(true);
    expect(loadedConfig.config.executeCode.enabled).toBe(true);
    expect(loadedConfig.config.executeCode.packageCachePath).toBe(path.join(workspace, '.cache', 'codeact'));
    expect(loadedConfig.config.executeCode.defaultTimeoutSeconds).toBe(12);
    expect(loadedConfig.errors).toEqual([]);
  });

  it('expands home paths', () => {
    const workspace = createWorkspace(`{
      "executeCode": { "packageCachePath": "~/codeact-cache" }
    }`);

    const loadedConfig = loadConfig(workspace);

    expect(loadedConfig.config.executeCode.packageCachePath).toBe(path.join(homedir(), 'codeact-cache'));
    expect(loadedConfig.errors).toEqual([]);
  });

  it('rejects invalid executeCode values', () => {
    const workspace = createWorkspace(`{
      "executeCode": {
        "packageCachePath": "",
        "defaultTimeoutSeconds": 0
      }
    }`);

    const loadedConfig = loadConfig(workspace);

    expect(loadedConfig.config.executeCode.defaultTimeoutSeconds).toBe(30);
    expect(loadedConfig.errors).toHaveLength(2);
  });
});
