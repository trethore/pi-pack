import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { discoverTemplateScripts } from '#src/scripts/discovery.js';

function createDirectories(): { agentDirectory: string; projectDirectory: string } {
  const root = mkdtempSync(path.join(tmpdir(), 'pi-script-template-discovery-'));
  const agentDirectory = path.join(root, 'agent');
  const projectDirectory = path.join(root, 'project');
  mkdirSync(path.join(agentDirectory, 'script-templates'), { recursive: true });
  mkdirSync(path.join(projectDirectory, '.pi', 'script-templates'), { recursive: true });
  vi.stubEnv('PI_CODING_AGENT_DIR', agentDirectory);
  return { agentDirectory, projectDirectory };
}

describe('discoverTemplateScripts', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('discovers supported files and applies project precedence', () => {
    // Arrange
    const { agentDirectory, projectDirectory } = createDirectories();
    writeFileSync(path.join(agentDirectory, 'script-templates', 'platform.mjs'), '');
    writeFileSync(path.join(agentDirectory, 'script-templates', 'global.cjs'), '');
    writeFileSync(path.join(projectDirectory, '.pi', 'script-templates', 'platform.js'), '');
    writeFileSync(path.join(projectDirectory, '.pi', 'script-templates', 'ignored.txt'), '');

    // Act
    const result = discoverTemplateScripts(projectDirectory);

    // Assert
    expect([...result.scripts.keys()]).toEqual(['global', 'platform']);
    expect(result.scripts.get('platform')?.scope).toBe('project');
    expect(result.scripts.get('global')?.scope).toBe('global');
    expect(result.diagnostics).toEqual([]);
  });

  it('excludes project scripts for untrusted projects', () => {
    // Arrange
    const { agentDirectory, projectDirectory } = createDirectories();
    writeFileSync(path.join(agentDirectory, 'script-templates', 'global.mjs'), '');
    writeFileSync(path.join(projectDirectory, '.pi', 'script-templates', 'project.mjs'), '');

    // Act
    const result = discoverTemplateScripts(projectDirectory, { includeProject: false });

    // Assert
    expect([...result.scripts.keys()]).toEqual(['global']);
  });

  it('reports invalid and duplicate names without registering duplicates', () => {
    // Arrange
    const { agentDirectory, projectDirectory } = createDirectories();
    const scriptsDirectory = path.join(projectDirectory, '.pi', 'script-templates');
    writeFileSync(path.join(agentDirectory, 'script-templates', 'duplicate.mjs'), '');
    writeFileSync(path.join(scriptsDirectory, 'bad name.mjs'), '');
    writeFileSync(path.join(scriptsDirectory, 'duplicate.js'), '');
    writeFileSync(path.join(scriptsDirectory, 'duplicate.mjs'), '');

    // Act
    const result = discoverTemplateScripts(projectDirectory);

    // Assert
    expect(result.scripts.has('duplicate')).toBe(false);
    expect(result.diagnostics).toHaveLength(2);
  });
});
