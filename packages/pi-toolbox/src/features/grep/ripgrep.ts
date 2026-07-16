import { formatRipgrepPaths, toResolvedDisplayPath } from '#src/utils/paths.js';
import { formatRipgrepSearchFilterArgs } from '#src/utils/ripgrep-args.js';
import { runRipgrepLines } from '#src/utils/ripgrep-runner.js';

export interface RunRipgrepGrepOptions {
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

export async function runRipgrepGrep(options: RunRipgrepGrepOptions): Promise<RipgrepGrepResult> {
  const result = await runRipgrepLines({
    toolName: 'grep',
    cwd: options.cwd,
    args: buildRipgrepArgs(options),
    limit: calculateCollectionLimit(options),
    signal: options.signal,
    parseLine: (line) => parseRipgrepMatchLine(line, options.maxCharsPerMatch),
    formatItemKey: (match) => formatMatchKey(options.cwd, match),
  });

  return { matches: result.items, limited: result.limited };
}

function calculateCollectionLimit(options: RunRipgrepGrepOptions): number {
  if (options.limitPerFile === undefined) return options.limit;

  return options.limit + Math.ceil(options.limit / options.limitPerFile);
}

function buildRipgrepArgs(options: RunRipgrepGrepOptions): string[] {
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

function formatMatchKey(cwd: string, match: RipgrepGrepMatch): string {
  return `${toResolvedDisplayPath(cwd, match.file)}\0${match.line}\0${match.text}`;
}

export function parseRipgrepMatchLine(line: string, maxCharsPerMatch: number): RipgrepGrepMatch | undefined {
  const event = parseRipgrepEvent(line);
  if (!isRipgrepJsonMatch(event)) return undefined;

  const file = event.data.path.text;
  const text = event.data.lines.text;
  if (file === undefined || text === undefined) return undefined;

  return {
    file,
    line: event.data.line_number,
    text: truncateMatchText(trimLineEnding(text), maxCharsPerMatch),
  };
}
