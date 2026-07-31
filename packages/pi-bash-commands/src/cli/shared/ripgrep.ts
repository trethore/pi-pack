import { spawn } from 'node:child_process';

import { rgPath } from '@vscode/ripgrep';

import { formatRipgrepPaths, toResolvedDisplayPath } from '#pi-bash-commands-cli/shared/paths';
import { formatRipgrepSearchArgs, formatRipgrepSearchFilterArgs } from '#pi-bash-commands-cli/shared/search';

interface RunFindOptions {
  cwd: string;
  patterns: string[];
  paths: string[];
  limit: number;
  depth?: number;
  noIgnore: boolean;
  visibleOnly: boolean;
}

interface FindResult {
  files: string[];
  limited: boolean;
}

interface RunGrepOptions {
  cwd: string;
  regexes: string[];
  paths: string[];
  globs: string[];
  limit: number;
  limitPerFile?: number;
  depth?: number;
  maxCharsPerMatch: number;
  noIgnore: boolean;
  visibleOnly: boolean;
}

export interface GrepMatch {
  file: string;
  line: number;
  text: string;
}

interface GrepResult {
  matches: GrepMatch[];
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

interface RunRipgrepLinesOptions<T> {
  cwd: string;
  args: string[];
  limit: number;
  parseLine: (line: string) => T | undefined;
  formatItemKey?: (item: T) => string;
}

interface RipgrepLinesResult<T> {
  items: T[];
  limited: boolean;
}

export async function runFind(options: RunFindOptions): Promise<FindResult> {
  const result = await runRipgrepLines({
    cwd: options.cwd,
    args: [
      '--files',
      ...formatRipgrepSearchArgs({
        depth: options.depth,
        globs: options.patterns,
        noIgnore: options.noIgnore,
        paths: options.paths,
        visibleOnly: options.visibleOnly,
      }),
    ],
    limit: options.limit,
    parseLine: (line) => line.replace(/\r$/, '') || undefined,
    formatItemKey: (file) => toResolvedDisplayPath(options.cwd, file),
  });

  return { files: result.items, limited: result.limited };
}

export async function runGrep(options: RunGrepOptions): Promise<GrepResult> {
  const result = await runRipgrepLines({
    cwd: options.cwd,
    args: buildGrepArgs(options),
    limit: calculateGrepCollectionLimit(options),
    parseLine: (line) => parseRipgrepMatchLine(line, options.maxCharsPerMatch),
    formatItemKey: (match) => `${toResolvedDisplayPath(options.cwd, match.file)}\0${match.line}\0${match.text}`,
  });

  return { matches: result.items, limited: result.limited };
}

function parseRipgrepMatchLine(line: string, maxCharsPerMatch: number): GrepMatch | undefined {
  const event = parseRipgrepEvent(line);
  if (!isRipgrepJsonMatch(event)) return undefined;

  const file = event.data.path.text;
  const text = event.data.lines.text;
  if (file === undefined || text === undefined) return undefined;

  return {
    file,
    line: event.data.line_number,
    text: truncateMatchText(text.replace(/\r?\n$/, ''), maxCharsPerMatch),
  };
}

function isRipgrepJsonMatch(event: RipgrepJsonEvent | undefined): event is RipgrepJsonMatch {
  return event?.type === 'match';
}

function calculateGrepCollectionLimit(options: RunGrepOptions): number {
  if (options.limitPerFile === undefined) return options.limit;
  return options.limit + Math.ceil(options.limit / options.limitPerFile);
}

function buildGrepArgs(options: RunGrepOptions): string[] {
  return [
    '--json',
    '-n',
    '--color',
    'never',
    ...(options.limitPerFile === undefined ? [] : ['--max-count', String(options.limitPerFile + 1)]),
    ...formatRipgrepSearchFilterArgs({
      depth: options.depth,
      globs: options.globs,
      noIgnore: options.noIgnore,
      visibleOnly: options.visibleOnly,
    }),
    ...options.regexes.flatMap((regex) => ['-e', regex]),
    ...formatRipgrepPaths(options.paths),
  ];
}

function parseRipgrepEvent(line: string): RipgrepJsonEvent | undefined {
  try {
    return JSON.parse(line) as RipgrepJsonEvent;
  } catch {
    return undefined;
  }
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

function runRipgrepLines<T>(options: RunRipgrepLinesOptions<T>): Promise<RipgrepLinesResult<T>> {
  return new Promise((resolve, reject) => {
    const items: T[] = [];
    const seenItemKeys = new Set<string>();
    const child = spawn(rgPath, options.args, {
      cwd: options.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdoutBuffer = '';
    let stderr = '';
    let limited = false;
    let settled = false;
    const collectionLimit = options.limit + 1;

    const resolveOnce = (result: RipgrepLinesResult<T>) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const rejectOnce = (error: Error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

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
      if (!settled) stderr += chunk;
    });

    child.on('error', (error) => rejectOnce(error));
    child.on('close', (code) => {
      if (settled) return;
      collectRemainingLine();

      if (limited) {
        resolveOnce({ items: items.slice(0, options.limit), limited: true });
        return;
      }
      if (code === 0 || (code === 1 && items.length === 0)) {
        resolveOnce({ items: items.slice(0, options.limit), limited: false });
        return;
      }

      const message = stderr.trim() || `rg exited with code ${code ?? 'unknown'}`;
      rejectOnce(new Error(message));
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
      if (stdoutBuffer && items.length < collectionLimit) collectLine(stdoutBuffer);
      stdoutBuffer = '';
    }

    function collectLine(line: string) {
      const item = options.parseLine(line);
      if (item === undefined) return;
      if (options.formatItemKey !== undefined) {
        const key = options.formatItemKey(item);
        if (seenItemKeys.has(key)) return;
        seenItemKeys.add(key);
      }
      items.push(item);
    }
  });
}
