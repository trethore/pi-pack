import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '#src/config/config.js';

function createWorkspace(config: string): string {
  const workspace = mkdtempSync(path.join(tmpdir(), 'pi-command-template-config-'));
  const configDirectory = path.join(workspace, '.pi');
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(path.join(configDirectory, 'pi-command-template.jsonc'), config);
  return workspace;
}

describe('loadConfig', () => {
  it('merges partial project config with defaults', () => {
    // Arrange
    const workspace = createWorkspace(`{
      "surfaces": { "skills": false },
      "execution": { "timeoutMs": 1234 },
      "templates": { "node-version": ["node", "--version"] }
    }`);

    // Act
    const loadedConfig = loadConfig(workspace);

    // Assert
    expect(loadedConfig.config.surfaces.skills).toBe(false);
    expect(loadedConfig.config.surfaces.system).toBe(false);
    expect(loadedConfig.config.execution.timeoutMs).toBe(1234);
    expect(loadedConfig.config.execution.maxOutputChars).toBe(20_000);
    expect(loadedConfig.config.execution.shell).toBe(false);
    expect(loadedConfig.config.templates['node-version']).toEqual(['node', '--version']);
    expect(loadedConfig.errors).toEqual([]);
  });

  it('rejects invalid template names and invalid execution values', () => {
    // Arrange
    const workspace = createWorkspace(`{
      "execution": { "timeoutMs": 0 },
      "templates": { "bad name": "node --version" }
    }`);

    // Act
    const loadedConfig = loadConfig(workspace);

    // Assert
    expect(loadedConfig.config.execution.timeoutMs).toBe(3000);
    expect(loadedConfig.config.templates).toEqual({});
    expect(loadedConfig.errors).toHaveLength(2);
  });

  it('rejects array commands without an executable', () => {
    // Arrange
    const workspace = createWorkspace(`{
      "templates": { "empty-command": [""] }
    }`);

    // Act
    const loadedConfig = loadConfig(workspace);

    // Assert
    expect(loadedConfig.config.templates).toEqual({});
    expect(loadedConfig.errors).toHaveLength(1);
  });
});
