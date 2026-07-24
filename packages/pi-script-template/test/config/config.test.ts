import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfigTestFileHelpers } from '@trethore/pi-shared/test/config-test-helpers.js';
import { loadConfig } from '#src/config/config.js';

const { makeTempDir, writeProjectConfig } = createConfigTestFileHelpers({
  configFileName: 'pi-script-template.jsonc',
  tempPrefix: 'pi-script-template-config-',
});

function createEnvironment(config: string): string {
  const root = makeTempDir();
  const agentDirectory = path.join(root, 'agent');
  const workspace = path.join(root, 'workspace');
  mkdirSync(agentDirectory, { recursive: true });
  writeProjectConfig(workspace, config);
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDirectory);
  return workspace;
}

describe('loadConfig', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('merges project configuration with defaults', () => {
    // Arrange
    const workspace = createEnvironment(`{
      "surfaces": { "skills": true },
      "execution": { "timeoutMs": 1234 }
    }`);

    // Act
    const loadedConfig = loadConfig(workspace);

    // Assert
    expect(loadedConfig.config.surfaces.skills).toBe(true);
    expect(loadedConfig.config.surfaces.system).toBe(false);
    expect(loadedConfig.config.execution.timeoutMs).toBe(1234);
    expect(loadedConfig.config.execution.maxOutputChars).toBe(20_000);
    expect(loadedConfig.errors).toEqual([]);
  });

  it('excludes project configuration when requested', () => {
    // Arrange
    const workspace = createEnvironment(`{
      "surfaces": { "skills": true }
    }`);

    // Act
    const loadedConfig = loadConfig(workspace, { includeProject: false });

    // Assert
    expect(loadedConfig.config.surfaces.skills).toBe(false);
  });

  it('rejects invalid execution values', () => {
    // Arrange
    const workspace = createEnvironment(`{
      "execution": { "timeoutMs": 0, "maxOutputChars": -1 }
    }`);

    // Act
    const loadedConfig = loadConfig(workspace);

    // Assert
    expect(loadedConfig.config.execution).toEqual({ timeoutMs: 3000, maxOutputChars: 20_000 });
    expect(loadedConfig.errors).toHaveLength(2);
  });
});
