import { spawn } from 'node:child_process';

import { getRipgrepExecutable } from '#src/utils/ripgrep-executable.js';

export interface RipgrepLinesResult<T> {
  items: T[];
  limited: boolean;
}

export interface RunRipgrepLinesOptions<T> {
  toolName: string;
  cwd: string;
  args: string[];
  limit: number;
  signal?: AbortSignal;
  parseLine: (line: string) => T | undefined;
  formatItemKey?: (item: T) => string;
}

export function runRipgrepLines<T>(options: RunRipgrepLinesOptions<T>): Promise<RipgrepLinesResult<T>> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }

    const items: T[] = [];
    const seenItemKeys = new Set<string>();
    const child = spawn(getRipgrepExecutable(), options.args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBuffer = '';
    let stderr = '';
    let limited = false;
    let settled = false;
    const collectionLimit = options.limit + 1;

    const cleanup = () => {
      options.signal?.removeEventListener('abort', abort);
    };

    const resolveOnce = (result: RipgrepLinesResult<T>) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(result);
    };

    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const abort = () => {
      child.kill();
      rejectOnce(new Error('Operation aborted'));
    };

    options.signal?.addEventListener('abort', abort, { once: true });

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      if (settled || limited) return;

      stdoutBuffer += chunk;
      collectCompleteLines();
      if (items.length >= collectionLimit) {
        limited = true;
        stdoutBuffer = '';
        child.kill();
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk: string) => {
      if (settled) return;

      stderr += chunk;
    });

    child.on('error', (error) => {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        rejectOnce(new Error(`${options.toolName} failed: rg executable not found`));
        return;
      }
      rejectOnce(error);
    });

    child.on('close', (code) => {
      if (settled) return;

      collectRemainingLine();

      if (limited) {
        resolveOnce({ items: items.slice(0, options.limit), limited });
        return;
      }

      if (code === 0 || (code === 1 && items.length === 0)) {
        resolveOnce({ items: items.slice(0, options.limit), limited: false });
        return;
      }

      rejectOnce(new Error(formatRipgrepError(options.toolName, code, stderr)));
    });

    function collectCompleteLines() {
      let lineEnd = stdoutBuffer.indexOf('\n');
      while (lineEnd !== -1 && items.length < collectionLimit) {
        collectLine(stdoutBuffer.slice(0, lineEnd));
        stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
        lineEnd = stdoutBuffer.indexOf('\n');
      }
    }

    function collectRemainingLine() {
      if (stdoutBuffer && items.length < collectionLimit) {
        collectLine(stdoutBuffer);
      }
      stdoutBuffer = '';
    }

    function collectLine(line: string) {
      const item = options.parseLine(line);
      if (item === undefined) return;
      if (isDuplicateItem(item)) return;

      items.push(item);
    }

    function isDuplicateItem(item: T): boolean {
      if (options.formatItemKey === undefined) return false;

      const key = options.formatItemKey(item);
      if (seenItemKeys.has(key)) return true;

      seenItemKeys.add(key);
      return false;
    }
  });
}

function formatRipgrepError(toolName: string, code: number | null, stderr: string): string {
  const message = stderr.trim() || `rg exited with code ${code ?? 'unknown'}`;
  return `${toolName} failed: ${message}`;
}
