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
    // Arrange
    const command = String.raw`printf "hello\n"`;

    // Act
    const result = runTemplateCommand({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, allowShell: true },
        templates: {},
      },
      workspaceCwd,
      extensionCwd,
      name: 'trim',
      command,
    });

    // Assert
    expect(result.output).toBe('hello');
    expect(result.diagnostics).toEqual([]);
  });

  it('supports array commands as direct executable arguments', () => {
    // Arrange
    const command = ['node', '-e', 'process.stdout.write(process.argv[1])', 'hello world'];

    // Act
    const result = runTemplateCommand({
      config: { ...defaultConfig, templates: {} },
      workspaceCwd,
      extensionCwd,
      name: 'array',
      command,
    });

    // Assert
    expect(result.output).toBe('hello world');
    expect(result.diagnostics).toEqual([]);
  });

  it('runs string commands through the shell when allowed', () => {
    // Arrange
    const command = 'printf hello | tr a-z A-Z';

    // Act
    const result = runTemplateCommand({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, allowShell: true },
        templates: {},
      },
      workspaceCwd,
      extensionCwd,
      name: 'shell',
      command,
    });

    // Assert
    expect(result.output).toBe('HELLO');
    expect(result.diagnostics).toEqual([]);
  });

  it('keeps stderr in output and reports non-zero exits', () => {
    // Arrange
    const command = ['node', '-e', 'process.stderr.write("bad"); process.exit(2)'];

    // Act
    const result = runTemplateCommand({
      config: { ...defaultConfig, templates: {} },
      workspaceCwd,
      extensionCwd,
      name: 'fail',
      command,
    });

    // Assert
    expect(result.output).toBe('[pi-command-template error: {{fail}}]');
    expect(result.diagnostics).toEqual([
      {
        severity: 'warning',
        template: 'fail',
        message: 'pi-command-template command {{fail}} exited with status 2.',
      },
    ]);
  });

  it('truncates long output', () => {
    // Arrange
    const command = ['node', '-e', 'process.stdout.write("abcdef")'];

    // Act
    const result = runTemplateCommand({
      config: {
        ...defaultConfig,
        execution: { ...defaultConfig.execution, maxOutputChars: 3 },
        templates: {},
      },
      workspaceCwd,
      extensionCwd,
      name: 'long',
      command,
    });

    // Assert
    expect(result.output).toBe('abc');
    expect(result.diagnostics[0]?.message).toContain('output truncated to 3 characters');
  });

  it('resolves relative custom cwd from the workspace cwd', () => {
    // Arrange
    const temporaryDirectory = mkdtempSync(path.join(tmpdir(), 'pi-command-template-'));
    const workspace = path.join(temporaryDirectory, 'workspace');
    const commandCwd = path.join(workspace, 'nested');
    mkdirSync(commandCwd, { recursive: true });

    // Act
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

    // Assert
    expect(result.output).toBe(commandCwd);
  });

  it('blocks string commands when shell execution is disabled', () => {
    // Arrange
    const command = 'printf hello';

    // Act
    const result = runTemplateCommand({
      config: { ...defaultConfig, templates: {} },
      workspaceCwd,
      extensionCwd,
      name: 'shell-disabled',
      command,
    });

    // Assert
    expect(result.output).toBe('[pi-command-template error: {{shell-disabled}}]');
    expect(result.diagnostics).toEqual([
      {
        severity: 'warning',
        template: 'shell-disabled',
        message:
          'pi-command-template command {{shell-disabled}} requires execution.allowShell to run string shell commands.',
      },
    ]);
  });
});
