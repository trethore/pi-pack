import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export type EvalLanguage = 'node' | 'python';

export interface EvalRuntimeConfig {
  command: string;
  args: string[];
}

export interface RunEvalOptions {
  cwd: string;
  language: EvalLanguage;
  code: string;
  runtime: EvalRuntimeConfig;
  timeoutMs: number;
  inheritEnv?: boolean;
  signal?: AbortSignal;
  onOutput?: (output: string) => void;
}

export interface RunEvalResult {
  output: string;
  exitCode: number | null;
  timedOut: boolean;
  durationMs: number;
}

export async function runEval(options: RunEvalOptions): Promise<RunEvalResult> {
  const startedAt = Date.now();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'pi-eval-'));
  const filePath = path.join(tempDir, getEvalFileName(options.language));

  try {
    await writeFile(filePath, options.code);
    return await runEvalFile(options, filePath, startedAt);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

function getEvalFileName(language: EvalLanguage): string {
  return language === 'node' ? 'code.mjs' : 'code.py';
}

async function runEvalFile(
  options: RunEvalOptions,
  filePath: string,
  startedAt: number
): Promise<RunEvalResult> {
  if (options.signal?.aborted) throw new Error('eval aborted');

  const command = options.inheritEnv
    ? options.runtime.command
    : await resolveCommand(options.runtime.command);
  if (options.signal?.aborted) throw new Error('eval aborted');

  const env = options.inheritEnv ? process.env : createCleanEnv();

  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    let output = '';
    const child = spawn(command, [...options.runtime.args, filePath], {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let timedOut = false;
    let aborted = false;
    let processTreeTermination: ProcessTreeTermination | undefined;
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killChild();
    }, options.timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (timedOut || aborted) {
        processTreeTermination?.force();
      } else {
        processTreeTermination?.cancel();
      }
      if (options.signal) options.signal.removeEventListener('abort', abort);
      callback();
    };

    const killChild = () => {
      if (child.pid === undefined) return;
      processTreeTermination = terminateProcessTree(child.pid);
    };

    const abort = () => {
      aborted = true;
      killChild();
    };

    const appendOutput = (data: Buffer) => {
      output += decoder.decode(data, { stream: true });
      options.onOutput?.(output);
    };

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.on('close', (exitCode) => {
      finish(() => {
        if (aborted) {
          reject(new Error('eval aborted'));
          return;
        }

        output += decoder.decode();
        resolve({
          output,
          exitCode,
          timedOut,
          durationMs: Date.now() - startedAt,
        });
      });
    });

    if (options.signal) options.signal.addEventListener('abort', abort, { once: true });
  });
}

async function resolveCommand(command: string): Promise<string> {
  if (isPathCommand(command)) return command;

  const pathValue = process.env.PATH ?? process.env.Path ?? process.env.path;
  if (!pathValue) return command;

  for (const pathEntry of pathValue.split(path.delimiter)) {
    for (const candidateName of getCommandCandidateNames(command)) {
      const candidatePath = path.join(pathEntry, candidateName);
      if (await canExecute(candidatePath)) return candidatePath;
    }
  }

  return command;
}

function isPathCommand(command: string): boolean {
  return path.isAbsolute(command) || command.includes('/') || command.includes('\\');
}

function getCommandCandidateNames(command: string): string[] {
  if (process.platform !== 'win32' || path.extname(command)) return [command];

  const pathExt = process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD';
  return [
    command,
    ...pathExt
      .split(';')
      .filter(Boolean)
      .map((extension) => `${command}${extension}`),
  ];
}

async function canExecute(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function createCleanEnv(): NodeJS.ProcessEnv {
  if (process.platform !== 'win32') return {};

  return Object.fromEntries(
    ['SystemRoot', 'WINDIR', 'TEMP', 'TMP']
      .map((key) => [key, process.env[key]] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined)
  );
}

interface ProcessTreeTermination {
  cancel: () => void;
  force: () => void;
}

function terminateProcessTree(pid: number): ProcessTreeTermination {
  if (process.platform === 'win32') {
    const child = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', noop);
    return { cancel: noop, force: noop };
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return { cancel: noop, force: noop };
  }

  let forced = false;
  const force = () => {
    if (forced) return;

    forced = true;
    clearTimeout(forceKill);
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      return;
    }
  };
  const forceKill = setTimeout(force, 500);
  forceKill.unref();

  return { cancel: () => clearTimeout(forceKill), force };
}

function noop(): void {
  return;
}
