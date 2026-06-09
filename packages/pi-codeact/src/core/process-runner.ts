import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

import { ExecutionOutputAccumulator, type ExecuteCodeOutputDetails } from '#src/core/output.js';

export interface RunProcessOptions {
  command: string;
  args: string[];
  cwd: string;
  env?: NodeJS.ProcessEnv;
  timeoutSeconds?: number;
  signal?: AbortSignal;
}

export interface RunProcessResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  output: string;
  details?: ExecuteCodeOutputDetails;
}

export class ProcessTimeoutError extends Error {
  constructor(
    readonly timeoutSeconds: number,
    readonly output: string
  ) {
    super(`process timed out after ${timeoutSeconds} seconds`);
  }
}

export class ProcessAbortedError extends Error {
  constructor(readonly output: string) {
    super('process aborted');
  }
}

export async function runProcess(options: RunProcessOptions): Promise<RunProcessResult> {
  return new Promise((resolve, reject) => {
    const output = new ExecutionOutputAccumulator();
    let settled = false;
    let timedOut = false;
    let aborted = false;
    const stdoutDecoder = new StringDecoder('utf8');
    const stderrDecoder = new StringDecoder('utf8');

    const child = spawn(options.command, options.args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const appendStdout = (chunk: Buffer) => {
      output.append(stdoutDecoder.write(chunk));
    };
    const appendStderr = (chunk: Buffer) => {
      output.append(stderrDecoder.write(chunk));
    };

    child.stdout.on('data', appendStdout);
    child.stderr.on('data', appendStderr);

    let forceKillTimeout: NodeJS.Timeout | undefined;
    const terminate = () => {
      child.kill('SIGTERM');
      forceKillTimeout = setTimeout(() => child.kill('SIGKILL'), 1000);
    };
    const timeout = options.timeoutSeconds
      ? setTimeout(() => {
          timedOut = true;
          terminate();
        }, options.timeoutSeconds * 1000)
      : undefined;

    const abort = () => {
      aborted = true;
      terminate();
    };

    if (options.signal?.aborted) abort();
    options.signal?.addEventListener('abort', abort, { once: true });

    const cleanup = () => {
      if (timeout) clearTimeout(timeout);
      if (forceKillTimeout) clearTimeout(forceKillTimeout);
      options.signal?.removeEventListener('abort', abort);
    };

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.finish();
      reject(error);
    });

    child.on('close', (exitCode, signal) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.append(stdoutDecoder.end());
      output.append(stderrDecoder.end());
      const formattedOutput = output.finish();

      if (timedOut && options.timeoutSeconds !== undefined) {
        reject(new ProcessTimeoutError(options.timeoutSeconds, formattedOutput.text));
        return;
      }

      if (aborted) {
        reject(new ProcessAbortedError(formattedOutput.text));
        return;
      }

      resolve({ exitCode, signal, output: formattedOutput.text, details: formattedOutput.details });
    });
  });
}
