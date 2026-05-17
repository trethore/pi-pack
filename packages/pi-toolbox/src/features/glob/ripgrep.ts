import { formatRipgrepPaths, toResolvedDisplayPath } from '#src/utils/paths.js';
import { runRipgrepLines } from '#src/utils/ripgrep-runner.js';
import {
  formatRipgrepExclusionGlobArgs,
  formatRipgrepHiddenArgs,
} from '#src/utils/ripgrep-visibility.js';

export interface RunRipgrepGlobOptions {
  cwd: string;
  patterns: string[];
  paths: string[];
  limit: number;
  noIgnore: boolean;
  visibleOnly: boolean;
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
    formatItemKey: (file) => toResolvedDisplayPath(options.cwd, file),
  });

  return { files: result.items, limited: result.limited };
}

function buildRipgrepArgs(options: RunRipgrepGlobOptions): string[] {
  return [
    '--files',
    ...formatRipgrepHiddenArgs(options.visibleOnly),
    ...options.patterns.flatMap((pattern) => ['-g', pattern]),
    ...formatRipgrepExclusionGlobArgs(options.visibleOnly),
    ...(options.noIgnore ? ['--no-ignore'] : []),
    ...formatRipgrepPaths(options.paths),
  ];
}

function parseFileLine(line: string): string | undefined {
  const file = line.trimEnd();
  return file || undefined;
}
