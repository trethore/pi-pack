import { stat } from 'node:fs/promises';
import path from 'node:path';

import { formatRipgrepPaths } from '#pi-bash-commands-cli/shared/paths';

interface RipgrepSearchFilterOptions {
  depth?: number;
  globs: readonly string[];
  noIgnore: boolean;
  visibleOnly: boolean;
}

export function formatRipgrepSearchFilterArgs(options: RipgrepSearchFilterOptions): string[] {
  return [
    ...(options.depth === undefined ? [] : ['--max-depth', String(options.depth)]),
    ...(options.visibleOnly ? [] : ['--hidden']),
    ...options.globs.flatMap((glob) => ['-g', glob]),
    ...formatExclusionGlobs(options.visibleOnly),
    ...(options.noIgnore ? ['--no-ignore'] : []),
  ];
}

export function formatRipgrepSearchArgs(options: RipgrepSearchFilterOptions & { paths: readonly string[] }): string[] {
  return [...formatRipgrepSearchFilterArgs(options), ...formatRipgrepPaths(options.paths)];
}

export async function assertSearchPaths(
  cwd: string,
  searchPaths: readonly string[],
  options: { requireDirectory?: boolean } = {}
): Promise<void> {
  await Promise.all(searchPaths.map((searchPath) => assertSearchPath(path.resolve(cwd, searchPath), options)));
}

function formatExclusionGlobs(visibleOnly: boolean): string[] {
  const globs = [...(visibleOnly ? ['!.*', '!**/.*'] : []), '!.git/**', '!**/.git/**'];
  return globs.flatMap((glob) => ['-g', glob]);
}

async function assertSearchPath(searchPath: string, options: { requireDirectory?: boolean }): Promise<void> {
  let stats;
  try {
    stats = await stat(searchPath);
  } catch (error) {
    throw new Error(`search path does not exist: ${searchPath}`, { cause: error });
  }

  if (options.requireDirectory === true && !stats.isDirectory()) {
    throw new Error(`search path is not a directory: ${searchPath}`);
  }
}
