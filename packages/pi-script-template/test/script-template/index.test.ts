import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConfigTestFileHelpers } from '@trethore/pi-shared/test/config-test-helpers.js';
import { removePiContentTransformer } from '@trethore/pi-shared/unsafe/content-transform.js';
import { transformPiContent } from '@trethore/pi-shared/unsafe/content-transform/state.js';
import { registerScriptTemplate } from '#src/script-template/index.js';

const transformerId = '@trethore/pi-script-template';
const { makeTempDir, writeGlobalConfig } = createConfigTestFileHelpers({
  configFileName: 'pi-script-template.jsonc',
  tempPrefix: 'pi-script-template-integration-',
});

function createEnvironment(): { agentDirectory: string; workspace: string } {
  const root = makeTempDir();
  const agentDirectory = path.join(root, '.pi', 'agent');
  const workspace = path.join(root, 'workspace');
  mkdirSync(path.join(agentDirectory, 'script-templates'), { recursive: true });
  mkdirSync(path.join(workspace, '.pi', 'script-templates'), { recursive: true });
  writeGlobalConfig(root, '{ "surfaces": { "contextFiles": true } }');
  writeFileSync(path.join(agentDirectory, 'script-templates', 'value.mjs'), 'process.stdout.write("global")');
  writeFileSync(path.join(workspace, '.pi', 'script-templates', 'value.mjs'), 'process.stdout.write("project")');
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDirectory);
  return { agentDirectory, workspace };
}

function createPi(): ExtensionAPI {
  return { on: () => {} } as unknown as ExtensionAPI;
}

describe('registerScriptTemplate', () => {
  afterEach(() => {
    removePiContentTransformer(transformerId);
    vi.unstubAllEnvs();
  });

  it('uses the project override for trusted content', () => {
    // Arrange
    const { workspace } = createEnvironment();
    registerScriptTemplate(createPi(), workspace);

    // Act
    const output = transformPiContent({
      surface: 'contextFile',
      content: '{{value}}',
      workspaceCwd: workspace,
      projectTrusted: true,
    });

    // Assert
    expect(output).toBe('project');
  });

  it('uses only global scripts for an untrusted project', () => {
    // Arrange
    const { workspace } = createEnvironment();
    registerScriptTemplate(createPi(), workspace);

    // Act
    const output = transformPiContent({
      surface: 'contextFile',
      content: '{{value}}',
      workspaceCwd: workspace,
      projectTrusted: false,
    });

    // Assert
    expect(output).toBe('global');
  });
});
