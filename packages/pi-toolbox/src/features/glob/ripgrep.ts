import { spawn } from 'node:child_process';

export interface RunRipgrepGlobOptions {
  basePath: string;
  pattern: string;
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
    const child = spawn('rg', args, { cwd: options.basePath, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdoutBuffer = '';
    let stderr = '';
    let limited = false;
    let aborted = false;

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
      if (files.length >= options.limit) {
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
        resolve({ files, limited });
        return;
      }

      if (code === 0 || (code === 1 && files.length === 0)) {
        resolve({ files, limited: false });
        return;
      }

      reject(new Error(formatRipgrepError(code, stderr)));
    });

    function collectCompleteLines() {
      let lineEnd = stdoutBuffer.indexOf('\n');
      while (lineEnd !== -1 && files.length < options.limit) {
        const line = stdoutBuffer.slice(0, lineEnd).trimEnd();
        stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
        if (line) files.push(line);
        lineEnd = stdoutBuffer.indexOf('\n');
      }
    }

    function collectRemainingLine() {
      if (stdoutBuffer && files.length < options.limit) {
        files.push(stdoutBuffer.trimEnd());
      }
      stdoutBuffer = '';
    }
  });
}

function buildRipgrepArgs(options: RunRipgrepGlobOptions): string[] {
  return [
    '--files',
    '-g',
    options.pattern,
    ...(options.noIgnore ? ['--no-ignore'] : []),
    ...(options.hidden ? ['--hidden'] : []),
  ];
}

function formatRipgrepError(code: number | null, stderr: string): string {
  const message = stderr.trim() || `rg exited with code ${code ?? 'unknown'}`;
  return `glob failed: ${message}`;
}
