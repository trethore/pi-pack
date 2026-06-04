import { mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '#src/config/schema.js';
import { runTemplateCommand } from '#src/core/command-runner.js';

const workspaceCwd = process.cwd();
const extensionCwd = process.cwd();

describe('runTemplateCommand', () => {
  it('trims one trailing line ending from output', () => {
    const result = runTemplateCommand({
      config: { ...defaultConfig, templates: {} },
      workspaceCwd,
      extensionCwd,
      name: 'trim',
      command: String.raw`printf "hello\n"`,
    });

    expect(result.output).toBe('hello');
    expect(result.diagnostics).toEqual([]);
  });

  it('supports array commands as direct executable arguments', () => {
    const result = runTemplateCommand({
      config: { ...defaultConfig, templates: {} },
      workspaceCwd,
      extensionCwd,
      name: 'array',
      command: ['node', '-e', 'process.stdout.write(process.argv[1])', 'hello world'],
    });

    expect(result.output).toBe('hello world');
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps stderr in output and reports non-zero exits', () => {
    const result = runTemplateCommand({
      config: { ...defaultConfig, templates: {} },
      workspaceCwd,
      extensionCwd,
      name: 'fail',
      command: ['node', '-e', 'process.stderr.write("bad"); process.exit(2)'],
      context: { surface: 'contextFiles', path: 'AGENTS.md' },
    });

    expect(result.output).toBe('bad');
    expect(result.diagnostics).toMatchObject([
      {
        severity: 'warning',
        template: 'fail',
        surface: 'contextFiles',
        path: 'AGENTS.md',
      },
    ]);
    expect(result.diagnostics[0]?.message).toContain('exited with status 2');
  });

  it('truncates long output', () => {
    const result = runTemplateCommand({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, maxOutputChars: 3 },
        templates: {},
      },
      workspaceCwd,
      extensionCwd,
      name: 'long',
      command: ['node', '-e', 'process.stdout.write("abcdef")'],
    });

    expect(result.output).toBe('abc');
    expect(result.diagnostics[0]?.message).toContain('output truncated to 3 characters');
  });

  it('resolves relative custom cwd from the workspace cwd', () => {
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'pi-command-template-'));
    const workspace = path.join(temporaryDirectory, 'workspace');
    const commandCwd = path.join(workspace, 'nested');
    mkdirSync(commandCwd, { recursive: true });

    const result = runTemplateCommand({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, cwd: 'nested' },
        templates: {},
      },
      workspaceCwd: workspace,
      extensionCwd,
      name: 'pwd',
      command: ['node', '-e', 'process.stdout.write(process.cwd())'],
    });

    expect(result.output).toBe(commandCwd);
  });
});
