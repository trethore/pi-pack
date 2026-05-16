import { spawn } from 'node:child_process';

export interface RunRipgrepGrepOptions {
  cwd: string;
  searchPath: string;
  regex: string;
  limit: number;
  limitPerFile?: number;
  maxCharsPerMatch: number;
  noIgnore: boolean;
  hidden: boolean;
  signal?: AbortSignal;
}

export interface RipgrepGrepMatch {
  file: string;
  line: number;
  text: string;
}

export interface RipgrepGrepResult {
  matches: RipgrepGrepMatch[];
  limited: boolean;
}

interface RipgrepJsonMatch {
  type: 'match';
  data: {
    path: { text?: string };
    lines: { text?: string };
    line_number: number;
  };
}

interface RipgrepJsonOther {
  type: string;
}

type RipgrepJsonEvent = RipgrepJsonMatch | RipgrepJsonOther;

export function runRipgrepGrep(options: RunRipgrepGrepOptions): Promise<RipgrepGrepResult> {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(new Error('Operation aborted'));
      return;
    }

    const matches: RipgrepGrepMatch[] = [];
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
      if (matches.length >= collectionLimit) {
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
        reject(new Error('grep failed: rg executable not found'));
        return;
      }
      reject(error);
    });

    child.on('close', (code) => {
      options.signal?.removeEventListener('abort', abort);
      if (aborted) return;

      collectRemainingLine();

      if (limited) {
        resolve({ matches, limited });
        return;
      }

      if (code === 0 || (code === 1 && matches.length === 0)) {
        resolve({ matches, limited: false });
        return;
      }

      reject(new Error(formatRipgrepError(code, stderr)));
    });

    function collectCompleteLines() {
      let lineEnd = stdoutBuffer.indexOf('\n');
      while (lineEnd !== -1 && matches.length < collectionLimit) {
        const line = stdoutBuffer.slice(0, lineEnd);
        stdoutBuffer = stdoutBuffer.slice(lineEnd + 1);
        collectMatch(line);
        lineEnd = stdoutBuffer.indexOf('\n');
      }
    }

    function collectRemainingLine() {
      if (stdoutBuffer && matches.length < collectionLimit) {
        collectMatch(stdoutBuffer);
      }
      stdoutBuffer = '';
    }

    function collectMatch(line: string) {
      const event = parseRipgrepEvent(line);
      if (!isRipgrepJsonMatch(event)) return;

      matches.push({
        file: event.data.path.text ?? '',
        line: event.data.line_number,
        text: truncateMatchText(
          trimLineEnding(event.data.lines.text ?? ''),
          options.maxCharsPerMatch
        ),
      });
    }
  });
}

function buildRipgrepArgs(options: RunRipgrepGrepOptions): string[] {
  return [
    '--json',
    '-n',
    '--color',
    'never',
    ...(options.limitPerFile === undefined
      ? []
      : ['--max-count', String(options.limitPerFile + 1)]),
    ...(options.noIgnore ? ['--no-ignore'] : []),
    ...(options.hidden ? ['--hidden'] : []),
    options.regex,
    options.searchPath,
  ];
}

function parseRipgrepEvent(line: string): RipgrepJsonEvent | undefined {
  try {
    return JSON.parse(line) as RipgrepJsonEvent;
  } catch {
    return undefined;
  }
}

function isRipgrepJsonMatch(event: RipgrepJsonEvent | undefined): event is RipgrepJsonMatch {
  return event?.type === 'match';
}

function trimLineEnding(value: string): string {
  return value.replace(/\r?\n$/, '');
}

function truncateMatchText(value: string, maxChars: number): string {
  let text = '';
  let count = 0;

  for (const char of value) {
    if (count >= maxChars) break;
    text += char;
    count += 1;
  }

  return text;
}

function formatRipgrepError(code: number | null, stderr: string): string {
  const message = stderr.trim() || `rg exited with code ${code ?? 'unknown'}`;
  return `grep failed: ${message}`;
}
