import path from 'node:path';
import type { ExecOptions, ExecResult } from '@earendil-works/pi-coding-agent';
import type { PiPromptCommandConfig } from '#src/config/schema.js';
import { parseCommandLine } from '#src/features/prompt-command/command-line.js';
import { resolvePermission } from '#src/features/prompt-command/permissions.js';

const PLACEHOLDER_PATTERN = /!`([^`\r\n]+)`/g;

export interface PromptCommandExecutor {
  exec(command: string, args: string[], options?: ExecOptions): Promise<ExecResult>;
}

export interface ReplaceCommandPlaceholdersOptions {
  config: PiPromptCommandConfig;
  executor: PromptCommandExecutor;
  cwd: string;
  signal?: AbortSignal;
  cache: Map<string, Promise<string>>;
}

export async function replaceCommandPlaceholders(
  text: string,
  options: ReplaceCommandPlaceholdersOptions
): Promise<string> {
  const matches = [...text.matchAll(PLACEHOLDER_PATTERN)];
  if (matches.length === 0) return text;

  const replacements = await Promise.all(
    matches.map(async (match) => ({
      start: match.index,
      end: match.index + match[0].length,
      output: await getCommandReplacement(match[1], options),
    }))
  );

  let result = '';
  let cursor = 0;
  for (const replacement of replacements) {
    result += text.slice(cursor, replacement.start) + replacement.output;
    cursor = replacement.end;
  }
  return result + text.slice(cursor);
}

async function getCommandReplacement(
  commandText: string,
  options: ReplaceCommandPlaceholdersOptions
): Promise<string> {
  const parsed = parseCommandLine(commandText);
  if (!parsed.ok) return formatPromptCommandError(parsed.error);

  const permission = resolvePermission(parsed.commandLine.normalized, options.config.permissions);
  if (permission.decision !== 'allow') {
    return formatPromptCommandError(`denied ${JSON.stringify(parsed.commandLine.normalized)}`);
  }

  const cacheKey = parsed.commandLine.normalized;
  const cached = options.cache.get(cacheKey);
  if (cached) return cached;

  const promise = executeCommand(parsed.commandLine.command, parsed.commandLine.args, options);
  options.cache.set(cacheKey, promise);
  return promise;
}

async function executeCommand(
  command: string,
  args: string[],
  options: ReplaceCommandPlaceholdersOptions
): Promise<string> {
  const result = await options.executor.exec(command, args, {
    cwd: resolveExecutionCwd(options.cwd, options.config.cwd),
    timeout: options.config.timeoutMs,
    signal: options.signal,
  });

  const output = limitOutput(result.stdout + result.stderr, options.config.maxOutputBytes);
  if (result.killed) return output + formatPromptCommandError('command was killed');
  return output;
}

function resolveExecutionCwd(baseCwd: string, configuredCwd: string | undefined): string {
  if (!configuredCwd) return baseCwd;
  return path.resolve(baseCwd, configuredCwd);
}

function limitOutput(output: string, maxBytes: number): string {
  const bytes = Buffer.byteLength(output, 'utf8');
  if (bytes <= maxBytes) return output;

  return `${Buffer.from(output, 'utf8').subarray(0, maxBytes).toString('utf8')}\n[pi-prompt-command: output truncated to ${maxBytes} bytes]`;
}

function formatPromptCommandError(message: string): string {
  return `[pi-prompt-command: ${message}]`;
}
