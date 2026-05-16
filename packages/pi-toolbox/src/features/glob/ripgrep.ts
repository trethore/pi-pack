import { spawn } from 'node:child_process';

import { formatRipgrepPaths } from '#src/utils/paths.js';

export interface RunRipgrepGlobOptions {
  cwd: string;
  patterns: string[];
  paths: string[];
  limit: number;
  noIgnore: boolean;
  hidden: boolean;
  signal?: AbortSignal;
}

export interface RipgrepGlobResult {
  files: string[];
  limited: boolean;
}

export function runRipgrepGlob(options: RunRipgrepGlobOptions): Promise<RipgrepGlobResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }

    const files: string[] = [];
    const args = buildRipgrepArgs(options);
    const child = spawn('rg', args, { cwd: options.cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdoutBuffer = '';
    let stderr = '';
    let limited = false;
    let aborted = false;
    const collectionLimit = options.limit + 1;

    const abort = () => {
      aborted = true;
      child.kill();
      reject(new Error('Operation aborted'));
    };

    options.signal?.addEventListener('abort', abort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      stdoutBuffer += chunk;
      collectCompleteLines();
      if (files.length >= collectionLimit) {
        limited = true;
        child.kill();
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      stderr += chunk;
    });

    child.on('error', (error) => {
      options.signal?.removeEventListener('abort', abort);
      if (aborted) return;
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        reject(new Error('glob failed: rg executable not found'));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', abort);
      if (aborted) return;

      collectRemainingLine();

      if (limited) {
        resolve({ files: files.slice(0, options.limit), limited });
        return;
      }

      if (code === 0 || (code === 1 && files.length === 0)) {
        resolve({ files: files.slice(0, options.limit), limited: false });
        return;
      }

      reject(new Error(formatRipgrepError(code, stderr)));
    });

    function collectCompleteLines() {
      let lineEnd = stdoutBuffer.indexOf('\n');
      while (lineEnd !== -1 && files.length < collectionLimit) {
        const line = stdoutBuffer.slice(0, lineEnd).trimEnd();
        stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
        if (line) files.push(line);
        lineEnd = stdoutBuffer.indexOf('\n');
      }
    }

    function collectRemainingLine() {
      if (stdoutBuffer && files.length < collectionLimit) {
        files.push(stdoutBuffer.trimEnd());
      }
      stdoutBuffer = '';
    }
  });
}

function buildRipgrepArgs(options: RunRipgrepGlobOptions): string[] {
  return [
    '--files',
    ...options.patterns.flatMap((pattern) => ['-g', pattern]),
    ...(options.noIgnore ? ['--no-ignore'] : []),
    ...(options.hidden ? ['--hidden'] : []),
    ...formatRipgrepPaths(options.paths),
  ];
}

function formatRipgrepError(code: number | null, stderr: string): string {
  const message = stderr.trim() || `rg exited with code ${code ?? 'unknown'}`;
  return `glob failed: ${message}`;
}
