import { formatRipgrepPaths, toResolvedDisplayPath } from '#src/utils/paths.js';
import { formatRipgrepDepthArgs } from '#src/utils/ripgrep-depth.js';
import { runRipgrepLines } from '#src/utils/ripgrep-runner.js';
import {
  formatRipgrepExclusionGlobArgs,
  formatRipgrepHiddenArgs,
} from '#src/utils/ripgrep-visibility.js';

export interface RunRipgrepFindFilesOptions {
  cwd: string;
  patterns: string[];
  paths: string[];
  limit: number;
  depth?: number;
  noIgnore: boolean;
  visibleOnly: boolean;
  signal?: AbortSignal;
}

export interface RipgrepFindFilesResult {
  files: string[];
  limited: boolean;
}

export async function runRipgrepFindFiles(
  options: RunRipgrepFindFilesOptions
): Promise<RipgrepFindFilesResult> {
  const result = await runRipgrepLines({
    toolName: 'find_files',
    cwd: options.cwd,
    args: buildRipgrepArgs(options),
    limit: options.limit,
    signal: options.signal,
    parseLine: parseFileLine,
    formatItemKey: (file) => toResolvedDisplayPath(options.cwd, file),
  });

  return { files: result.items, limited: result.limited };
}

function buildRipgrepArgs(options: RunRipgrepFindFilesOptions): string[] {
  return [
    '--files',
    '--sort',
    'path',
    ...formatRipgrepHiddenArgs(options.visibleOnly),
    ...formatRipgrepDepthArgs(options.depth),
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
