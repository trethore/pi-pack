import { formatRipgrepPaths } from '#src/utils/paths.js';
import { formatRipgrepDepthArgs } from '#src/utils/ripgrep-depth.js';
import {
  formatRipgrepExclusionGlobArgs,
  formatRipgrepHiddenArgs,
} from '#src/utils/ripgrep-visibility.js';

export interface RipgrepSearchFilterArgsOptions {
  depth?: number;
  globs: readonly string[];
  noIgnore: boolean;
  visibleOnly: boolean;
}

export interface RipgrepSearchArgsOptions extends RipgrepSearchFilterArgsOptions {
  paths: readonly string[];
}

export function formatRipgrepSearchFilterArgs(options: RipgrepSearchFilterArgsOptions): string[] {
  return [
    ...formatRipgrepDepthArgs(options.depth),
    ...formatRipgrepHiddenArgs(options.visibleOnly),
    ...options.globs.flatMap((glob) => ['-g', glob]),
    ...formatRipgrepExclusionGlobArgs(options.visibleOnly),
    ...(options.noIgnore ? ['--no-ignore'] : []),
  ];
}

export function formatRipgrepSearchArgs(options: RipgrepSearchArgsOptions): string[] {
  return [...formatRipgrepSearchFilterArgs(options), ...formatRipgrepPaths(options.paths)];
}
