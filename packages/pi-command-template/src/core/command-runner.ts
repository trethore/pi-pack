import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { PiCommandTemplateConfig, TemplateCommand } from '#src/config/schema.js';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';

export interface CommandRunResult {
  output: string;
  diagnostics: CommandDiagnostic[];
}

interface RunCommandOptions {
  config: PiCommandTemplateConfig;
  workspaceCwd: string;
  extensionCwd: string;
  name: string;
  command: TemplateCommand;
}

export function runTemplateCommand(options: RunCommandOptions): CommandRunResult {
  if (typeof options.command === 'string' && !options.config.execution.allowShell) {
    return {
      output: createCommandFailureOutput(options.name),
      diagnostics: [
        createCommandDiagnostic(
          options,
          `pi-command-template command {{${options.name}}} requires execution.allowShell to run string shell commands.`
        ),
      ],
    };
  }

  const cwd = resolveExecutionCwd(options.config.execution.cwd, options.workspaceCwd, options.extensionCwd);
  const spawnOptions = {
    cwd,
    encoding: 'utf8' as const,
    timeout: options.config.execution.timeoutMs,
    maxBuffer: Math.max(options.config.execution.maxOutputChars * 4, 1024),
  };

  const result = runSpawnCommand(options.command, spawnOptions);
  const diagnostics = createResultDiagnostics(options, result);
  const output = createResultOutput(options, result, diagnostics);

  return { output, diagnostics };
}

function createResultOutput(
  options: RunCommandOptions,
  result: ReturnType<typeof spawnSync>,
  diagnostics: CommandDiagnostic[]
): string {
  const stdout = typeof result.stdout === 'string' ? result.stdout : '';
  const stderr = typeof result.stderr === 'string' ? result.stderr : '';
  const output = trimOneTrailingLineEnding(`${stdout}${stderr}`);

  if (isCommandFailure(result)) return createCommandFailureOutput(options.name);
  if (output.length <= options.config.execution.maxOutputChars) return output;

  diagnostics.push(
    createCommandDiagnostic(
      options,
      `pi-command-template command {{${options.name}}} output truncated to ${options.config.execution.maxOutputChars} characters.`
    )
  );
  return output.slice(0, options.config.execution.maxOutputChars);
}

function createResultDiagnostics(
  options: RunCommandOptions,
  result: ReturnType<typeof spawnSync>
): CommandDiagnostic[] {
  const diagnostics: CommandDiagnostic[] = [];
  if (result.error) {
    diagnostics.push(
      createCommandDiagnostic(
        options,
        `pi-command-template command {{${options.name}}} failed: ${result.error.message}`
      )
    );
  }

  if (result.status !== null && result.status !== 0) {
    diagnostics.push(
      createCommandDiagnostic(
        options,
        `pi-command-template command {{${options.name}}} exited with status ${result.status}.`
      )
    );
  }

  if (result.signal) {
    diagnostics.push(
      createCommandDiagnostic(
        options,
        `pi-command-template command {{${options.name}}} terminated by signal ${result.signal}.`
      )
    );
  }
  return diagnostics;
}

function isCommandFailure(result: ReturnType<typeof spawnSync>): boolean {
  return result.error !== undefined || (result.status !== null && result.status !== 0) || result.signal !== null;
}

function runSpawnCommand(
  command: TemplateCommand,
  options: Parameters<typeof spawnSync>[2]
): ReturnType<typeof spawnSync> {
  if (Array.isArray(command)) return spawnDirect(command, options);
  return spawnSync(command, { ...options, shell: true });
}

function spawnDirect(command: string[], options: Parameters<typeof spawnSync>[2]): ReturnType<typeof spawnSync> {
  const [file, ...args] = command;
  if (!file) {
    return {
      stdout: '',
      stderr: '',
      status: 1,
      signal: null,
      output: ['', '', ''],
      pid: 0,
      error: new Error('empty command'),
    } as ReturnType<typeof spawnSync>;
  }
  return spawnSync(file, args, { ...options, shell: false });
}

function resolveExecutionCwd(value: string, workspaceCwd: string, extensionCwd: string): string {
  if (value === 'workspace') return workspaceCwd;
  if (value === 'extension') return extensionCwd;
  return path.isAbsolute(value) ? value : path.resolve(workspaceCwd, value);
}

function createCommandDiagnostic(options: RunCommandOptions, message: string): CommandDiagnostic {
  return {
    severity: 'warning',
    template: options.name,
    message,
  };
}

function createCommandFailureOutput(name: string): string {
  return `[pi-command-template error: {{${name}}}]`;
}

function trimOneTrailingLineEnding(value: string): string {
  return value.replace(/\r?\n$/, '');
}
