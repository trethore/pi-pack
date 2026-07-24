import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import { runTemplateScript } from '#src/scripts/runner.js';

function createScript(name: string, contents: string) {
  const directory = mkdtempSync(path.join(tmpdir(), 'pi-script-template-runner-'));
  const filePath = path.join(directory, `${name}.mjs`);
  writeFileSync(filePath, contents);
  return { name, filePath, scope: 'project' as const };
}

describe('runTemplateScript', () => {
  it('uses the script directory as cwd and exposes the workspace', () => {
    // Arrange
    const workspace = mkdtempSync(path.join(tmpdir(), 'pi-script-template-workspace-'));
    const script = createScript(
      'context',
      'process.stdout.write(JSON.stringify({ cwd: process.cwd(), workspace: process.env.PI_WORKSPACE_CWD }))'
    );

    // Act
    const result = runTemplateScript({ execution: defaultConfig.execution, workspaceCwd: workspace, script });

    // Assert
    expect(JSON.parse(result.output)).toEqual({ cwd: path.dirname(script.filePath), workspace });
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps stderr out of output and reports it', () => {
    // Arrange
    const script = createScript('stderr', 'process.stdout.write("value"); process.stderr.write("warning")');

    // Act
    const result = runTemplateScript({
      execution: defaultConfig.execution,
      workspaceCwd: process.cwd(),
      script,
    });

    // Assert
    expect(result.output).toBe('value');
    expect(result.diagnostics[0]?.message).toContain('wrote to stderr: warning');
  });

  it('returns a marker for failed scripts', () => {
    // Arrange
    const script = createScript('failure', 'process.exit(2)');

    // Act
    const result = runTemplateScript({
      execution: defaultConfig.execution,
      workspaceCwd: process.cwd(),
      script,
    });

    // Assert
    expect(result.output).toBe('[pi-script-template error: {{failure}}]');
    expect(result.diagnostics[0]?.message).toContain('exited with status 2');
  });

  it('truncates long output', () => {
    // Arrange
    const script = createScript('long', 'process.stdout.write("abcdef")');
    const execution = { ...defaultConfig.execution, maxOutputChars: 3 };

    // Act
    const result = runTemplateScript({ execution, workspaceCwd: process.cwd(), script });

    // Assert
    expect(result.output).toBe('abc');
    expect(result.diagnostics[0]?.message).toContain('truncated to 3 characters');
  });
});
