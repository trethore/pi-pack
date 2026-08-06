import {
  DEFAULT_FIND_CLI_DEFAULTS,
  DEFAULT_GREP_CLI_DEFAULTS,
  type FindCliDefaults,
  type GrepCliDefaults,
} from '#pi-bash-commands-cli/shared/defaults';
import { DEPTH_RANGE, LIMIT_RANGE, MAX_CHARS_PER_MATCH_RANGE } from '#pi-bash-commands-cli/shared/limits';

export const PI_FIND_DESCRIPTION =
  'Find files recursively under search roots using `rg --files`, optionally filtered by ripgrep-style glob patterns. Use for file discovery; prefer it when its options are sufficient because it produces bounded, token-efficient output.';

export function createPiFindHelp(defaults: FindCliDefaults = DEFAULT_FIND_CLI_DEFAULTS): string {
  return `
Usage: pi-find [options]

Find files recursively under search roots using rg --files.

Options:
  --patterns <glob>   Ripgrep-style glob filter. Repeat --patterns for each filter.
                      Prefix exclusions with !.
  --paths <path>      Search directory. Repeat --paths for each search directory.
                      Defaults to the current directory.
  --limit <number>    Maximum number of files to return. Integer from ${LIMIT_RANGE.minimum} to ${LIMIT_RANGE.maximum}.
                      Defaults to ${defaults.defaultLimit}.
  --depth <number>    Maximum traversal depth from each search directory. Integer at least ${DEPTH_RANGE.minimum}.
  --no-ignore         Include files excluded by ignore files. The .git directory remains excluded.
  --visible-only      Search only visible files and directories.
  -h, --help          Show this help.
`.trim();
}

export const PI_GREP_DESCRIPTION =
  "Search file contents using ripgrep via `rg --json -n -e '<regex>' -g '<glob>' <path(s)>`. Use to explore text across files; prefer it when its options are sufficient because it produces bounded, token-efficient output.";

export function createPiGrepHelp(defaults: GrepCliDefaults = DEFAULT_GREP_CLI_DEFAULTS): string {
  const limitPerFileDefault =
    defaults.defaultLimitPerFile === undefined ? '' : ` Defaults to ${defaults.defaultLimitPerFile}.`;
  return `
Usage: pi-grep --regexes <regex> [options]

Search file contents using ripgrep regular expressions.

Options:
  --regexes <regex>               Regular expression to search for. Repeat --regexes for each expression.
  --paths <path>                  File or directory to search. Repeat --paths for each path.
                                  Defaults to the current directory.
  --globs <glob>                  Ripgrep-style glob filter. Repeat --globs for each filter.
                                  Prefix exclusions with !.
  --limit <number>                Maximum matching lines to return globally. Integer from ${LIMIT_RANGE.minimum} to ${LIMIT_RANGE.maximum}.
                                  Defaults to ${defaults.defaultLimit}.
  --limit-per-file <number>       Maximum matching lines to return per file. Integer from ${LIMIT_RANGE.minimum} to ${LIMIT_RANGE.maximum}.${limitPerFileDefault}
  --depth <number>                Maximum traversal depth from each search path. Integer at least ${DEPTH_RANGE.minimum}.
  --max-chars-per-match <number>  Maximum characters shown per matching line. Integer from ${MAX_CHARS_PER_MATCH_RANGE.minimum} to ${MAX_CHARS_PER_MATCH_RANGE.maximum}.
                                  Defaults to ${defaults.defaultMaxCharsPerMatch}.
  --no-ignore                     Include files excluded by ignore files. The .git directory remains excluded.
  --visible-only                  Search only visible files and directories.
  -h, --help                      Show this help.
`.trim();
}

export const PI_FIND_HELP = createPiFindHelp();
export const PI_GREP_HELP = createPiGrepHelp();
