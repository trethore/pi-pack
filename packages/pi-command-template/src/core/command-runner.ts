import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { PiCommandTemplateConfig, TemplateCommand } from '#src/config/schema.js';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';
import type { RenderContext } from '#src/core/types.js';

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
  context?: RenderContext;
}

export function runTemplateCommand(options: RunCommandOptions): CommandRunResult {
  const cwd = resolveExecutionCwd(options.config.execution.cwd, options.workspaceCwd, options.extensionCwd);
  const spawnOptions = {
    cwd,
    shell: typeof options.command === 'string' && options.config.execution.shell,
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

  if (isCommandFailure(result)) return `[pi-command-template error: {{${options.name}}}]`;
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
  if (options?.shell) return spawnSync(command, options);
  try {
    return spawnDirect(parseCommandArgs(command), options);
  } catch (error) {
    return createSpawnErrorResult(error);
  }
}

function spawnDirect(command: string[], options: Parameters<typeof spawnSync>[2]): ReturnType<typeof spawnSync> {
  const args = [...command];
  const file = args.shift();
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

function createSpawnErrorResult(error: unknown): ReturnType<typeof spawnSync> {
  return {
    stdout: '',
    stderr: '',
    status: 1,
    signal: null,
    output: ['', '', ''],
    pid: 0,
    error: error instanceof Error ? error : new Error(String(error)),
  } as ReturnType<typeof spawnSync>;
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
    surface: options.context?.surface,
    path: options.context?.path,
    message,
  };
}

interface ParseState {
  args: string[];
  current: string;
  quote?: string;
  escaped: boolean;
  argStarted: boolean;
}

function parseCommandArgs(argsString: string): string[] {
  const state: ParseState = { args: [], current: '', escaped: false, argStarted: false };
  for (const char of argsString) applyCommandArgChar(state, char);
  if (state.escaped) state.current += '\\';
  if (state.quote) throw new Error(`unterminated ${state.quote} quote`);
  pushCurrentArg(state);
  return state.args;
}

function applyCommandArgChar(state: ParseState, char: string): void {
  if (consumeEscapedChar(state, char)) return;
  if (startEscape(state, char)) return;
  if (consumeQuotedChar(state, char)) return;
  if (startQuote(state, char)) return;
  if (consumeWhitespace(state, char)) return;
  state.current += char;
  state.argStarted = true;
}

function consumeEscapedChar(state: ParseState, char: string): boolean {
  if (!state.escaped) return false;
  state.current += char;
  state.escaped = false;
  state.argStarted = true;
  return true;
}

function startEscape(state: ParseState, char: string): boolean {
  if (char !== '\\' || state.quote === "'") return false;
  state.escaped = true;
  state.argStarted = true;
  return true;
}

function consumeQuotedChar(state: ParseState, char: string): boolean {
  if (!state.quote) return false;
  if (char === state.quote) {
    state.quote = undefined;
  } else {
    state.current += char;
  }
  return true;
}

function startQuote(state: ParseState, char: string): boolean {
  if (char !== '"' && char !== "'") return false;
  state.quote = char;
  state.argStarted = true;
  return true;
}

function consumeWhitespace(state: ParseState, char: string): boolean {
  if (!/\s/.test(char)) return false;
  pushCurrentArg(state);
  return true;
}

function pushCurrentArg(state: ParseState): void {
  if (!state.argStarted) return;
  state.args.push(state.current);
  state.current = '';
  state.argStarted = false;
}

function trimOneTrailingLineEnding(value: string): string {
  return value.replace(/\r?\n$/, '');
}
