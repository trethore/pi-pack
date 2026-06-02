import { spawn } from 'node:child_process';
import { constants, createWriteStream, mkdtempSync, type WriteStream } from 'node:fs';
import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

import { DEFAULT_MAX_BYTES } from '@earendil-works/pi-coding-agent';

const NEWLINE_BYTE = 10;
const UTF8_CONTINUATION_MASK = 192;
const UTF8_CONTINUATION_PREFIX = 128;

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
  outputTruncated?: boolean;
  outputBytes?: number;
  outputLines?: number;
  fullOutputPath?: string;
}

export async function runEval(options: RunEvalOptions): Promise<RunEvalResult> {
  const startedAt = Date.now();
  const tempDir = await mkdtemp(path.join(tmpdir(), 'pi-eval-'));
  const filePath = path.join(tempDir, getEvalFileName(options.language));
  const outputCapture = new EvalOutputCapture();
  let keepFullOutput = false;

  try {
    await writeFile(filePath, options.code);
    const result = await runEvalFile(options, filePath, startedAt, outputCapture);
    keepFullOutput = result.fullOutputPath !== undefined;
    return result;
  } finally {
    await rm(tempDir, { recursive: true, force: true });
    if (!keepFullOutput) await outputCapture.dispose();
  }
}

function getEvalFileName(language: EvalLanguage): string {
  return language === 'node' ? 'code.mjs' : 'code.py';
}

async function runEvalFile(
  options: RunEvalOptions,
  filePath: string,
  startedAt: number,
  outputCapture: EvalOutputCapture
): Promise<RunEvalResult> {
  if (options.signal?.aborted) throw new Error('eval aborted');

  const command = options.inheritEnv
    ? options.runtime.command
    : await resolveCommand(options.runtime.command);
  if (options.signal?.aborted) throw new Error('eval aborted');

  const env = options.inheritEnv ? process.env : createCleanEnv();

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...options.runtime.args, filePath], {
      cwd: options.cwd,
      detached: process.platform !== 'win32',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    const outputStreams = [child.stdout, child.stderr].filter(
      (stream): stream is Readable => stream !== null
    );
    let outputBackpressurePaused = false;
    let timedOut = false;
    let aborted = false;
    let processTreeTermination: ProcessTreeTermination | undefined;
    let settled = false;

    const killChild = () => {
      if (child.pid === undefined) return;
      processTreeTermination = terminateProcessTree(child.pid);
    };

    const abort = () => {
      aborted = true;
      killChild();
    };

    if (options.signal) {
      options.signal.addEventListener('abort', abort, { once: true });
      if (options.signal.aborted) abort();
    }

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

    const pauseOutputStreams = () => {
      if (outputBackpressurePaused) return;

      outputBackpressurePaused = true;
      for (const stream of outputStreams) stream.pause();
      outputCapture.onceWritable(() => {
        outputBackpressurePaused = false;
        for (const stream of outputStreams) stream.resume();
      });
    };

    const appendOutput = (data: Buffer) => {
      if (!outputCapture.append(data)) pauseOutputStreams();
      options.onOutput?.(outputCapture.getCurrentOutput());
    };

    child.stdout?.on('data', appendOutput);
    child.stderr?.on('data', appendOutput);

    child.on('error', (error) => {
      finish(() => reject(error));
    });

    child.on('close', (exitCode) => {
      finish(() => {
        void outputCapture.finalize().then(() => {
          if (aborted) {
            reject(new Error('eval aborted'));
            return;
          }

          const outputResult = outputCapture.getResult();
          resolve({
            output: outputResult.output,
            exitCode,
            timedOut,
            durationMs: Date.now() - startedAt,
            outputTruncated: outputResult.truncated || undefined,
            outputBytes: outputResult.totalBytes,
            outputLines: outputResult.totalLines,
            fullOutputPath: outputResult.truncated ? outputResult.path : undefined,
          });
        }, reject);
      });
    });
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
  if (process.platform === 'win32') return terminateWindowsProcessTree(pid);

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

function terminateWindowsProcessTree(pid: number): ProcessTreeTermination {
  let forced = false;
  const force = () => {
    if (forced) return;

    forced = true;
    clearTimeout(forceKill);
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      return;
    }
  };
  const forceKill = setTimeout(force, 500);
  forceKill.unref();

  const child = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], {
    stdio: 'ignore',
    windowsHide: true,
  });
  child.on('error', force);
  child.on('exit', (exitCode) => {
    if (exitCode !== 0) force();
  });

  return { cancel: () => clearTimeout(forceKill), force };
}

interface EvalOutputCaptureResult {
  output: string;
  truncated: boolean;
  totalBytes: number;
  totalLines: number;
  path?: string;
}

class EvalOutputCapture {
  private rawChunks: Buffer[] = [];
  private tailChunks: Buffer[] = [];
  private tailBytes = 0;
  private totalBytes = 0;
  private totalNewlines = 0;
  private lastByte: number | undefined;
  private tempDir: string | undefined;
  private outputPath: string | undefined;
  private outputStream: WriteStream | undefined;
  private outputError: Error | undefined;
  private finalized = false;

  append(data: Buffer): boolean {
    this.totalBytes += data.length;
    this.totalNewlines += countNewlines(data);
    this.lastByte = data.at(-1) ?? this.lastByte;
    this.appendTail(data);

    if (!this.outputStream && this.totalBytes <= DEFAULT_MAX_BYTES) {
      this.rawChunks.push(data);
      return true;
    }

    const flushed = this.ensureOutputStream();
    return this.writeFullOutput(data) && flushed;
  }

  onceWritable(callback: () => void): void {
    if (!this.outputStream || this.outputError) {
      queueMicrotask(callback);
      return;
    }

    const onReady = () => {
      this.outputStream?.off('drain', onReady);
      this.outputStream?.off('error', onReady);
      callback();
    };
    this.outputStream.once('drain', onReady);
    this.outputStream.once('error', onReady);
  }

  getCurrentOutput(): string {
    return Buffer.concat(this.tailChunks, this.tailBytes).toString('utf8');
  }

  async finalize(): Promise<void> {
    if (this.finalized) return;

    this.finalized = true;
    if (!this.outputStream) return;

    this.outputStream.end();
    await finished(this.outputStream);
    if (this.outputError) throw this.outputError;
  }

  getResult(): EvalOutputCaptureResult {
    return {
      output: this.getCurrentOutput(),
      truncated: this.totalBytes > this.tailBytes,
      totalBytes: this.totalBytes,
      totalLines: this.getTotalLines(),
      path: this.outputPath,
    };
  }

  async dispose(): Promise<void> {
    if (!this.finalized) {
      this.outputStream?.destroy();
    }
    if (this.tempDir) await rm(this.tempDir, { recursive: true, force: true });
  }

  private appendTail(data: Buffer): void {
    this.tailChunks.push(data);
    this.tailBytes += data.length;
    this.trimTail();
  }

  private ensureOutputStream(): boolean {
    if (this.outputStream) return true;

    this.tempDir = mkdtempSync(path.join(tmpdir(), 'pi-eval-output-'));
    this.outputPath = path.join(this.tempDir, 'output.txt');
    this.outputStream = createWriteStream(this.outputPath);
    this.outputStream.on('error', (error) => {
      this.outputError = error;
    });

    let canContinue = true;
    for (const chunk of this.rawChunks) {
      if (!this.outputStream.write(chunk)) canContinue = false;
    }
    this.rawChunks = [];
    return canContinue;
  }

  private writeFullOutput(data: Buffer): boolean {
    if (this.outputError) return true;
    return this.outputStream?.write(data) ?? true;
  }

  private getTotalLines(): number {
    if (this.totalBytes === 0) return 0;
    return this.totalNewlines + (this.lastByte === NEWLINE_BYTE ? 0 : 1);
  }

  private trimTail(): void {
    while (this.tailBytes > DEFAULT_MAX_BYTES) {
      const firstChunk = this.tailChunks[0];
      const overflowBytes = this.tailBytes - DEFAULT_MAX_BYTES;
      if (firstChunk.length <= overflowBytes) {
        this.tailChunks.shift();
        this.tailBytes -= firstChunk.length;
        continue;
      }

      const start = findUtf8Boundary(firstChunk, overflowBytes);
      this.tailChunks[0] = Buffer.from(firstChunk.subarray(start));
      this.tailBytes -= start;
    }
  }
}

function countNewlines(data: Buffer): number {
  let count = 0;
  for (const byte of data) {
    if (byte === NEWLINE_BYTE) count += 1;
  }
  return count;
}

function findUtf8Boundary(buffer: Buffer, start: number): number {
  let index = start;
  while (
    index < buffer.length &&
    (buffer[index] & UTF8_CONTINUATION_MASK) === UTF8_CONTINUATION_PREFIX
  ) {
    index += 1;
  }
  return index;
}

function noop(): void {
  return;
}
