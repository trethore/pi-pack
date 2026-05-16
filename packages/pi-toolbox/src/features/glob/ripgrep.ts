import { formatRipgrepPaths } from '#src/utils/paths.js';
import { runRipgrepLines } from '#src/utils/ripgrep-runner.js';

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

export async function runRipgrepGlob(options: RunRipgrepGlobOptions): Promise<RipgrepGlobResult> {
  const result = await runRipgrepLines({
    toolName: 'glob',
    cwd: options.cwd,
    args: buildRipgrepArgs(options),
    limit: options.limit,
    signal: options.signal,
    parseLine: parseFileLine,
  });

  return { files: result.items, limited: result.limited };
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

function parseFileLine(line: string): string | undefined {
  const file = line.trimEnd();
  return file || undefined;
}
