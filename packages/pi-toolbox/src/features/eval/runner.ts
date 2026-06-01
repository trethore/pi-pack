import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
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

function runEvalFile(
  options: RunEvalOptions,
  filePath: string,
  startedAt: number
): Promise<RunEvalResult> {
  if (options.signal?.aborted) throw new Error('eval aborted');

  return new Promise((resolve, reject) => {
    const decoder = new TextDecoder();
    let output = '';
    const child = spawn(options.runtime.command, [...options.runtime.args, filePath], {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let timedOut = false;
    let aborted = false;
    let cancelForceKill: (() => void) | undefined;
    let settled = false;

    const timeoutHandle = setTimeout(() => {
      timedOut = true;
      killChild();
    }, options.timeoutMs);

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      cancelForceKill?.();
      if (options.signal) options.signal.removeEventListener('abort', abort);
      callback();
    };

    const killChild = () => {
      if (child.pid === undefined) return;
      cancelForceKill = terminateProcessTree(child.pid);
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

function terminateProcessTree(pid: number): () => void {
  if (process.platform === 'win32') {
    const child = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    child.on('error', noop);
    return noop;
  }

  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    return noop;
  }

  const forceKill = setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      return;
    }
  }, 500);
  forceKill.unref();

  return () => clearTimeout(forceKill);
}

function noop(): void {
  return;
}
