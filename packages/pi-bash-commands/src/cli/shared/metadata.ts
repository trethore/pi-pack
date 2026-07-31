import {
  DEFAULT_FIND_CLI_DEFAULTS,
  DEFAULT_GREP_CLI_DEFAULTS,
  type FindCliDefaults,
  type GrepCliDefaults,
} from '#pi-bash-commands-cli/shared/defaults';

export const PI_FIND_DESCRIPTION =
  'Find files recursively under search roots using rg --files, optionally filtered by ripgrep-style glob patterns.';

export function createPiFindHelp(defaults: FindCliDefaults = DEFAULT_FIND_CLI_DEFAULTS): string {
  return `
Usage: pi-find [options]

Find files recursively under search roots using rg --files.

Options:
  --patterns <glob>   Ripgrep-style glob filter. Repeat for multiple filters.
                      Prefix exclusions with !.
  --paths <path>      Search root. Repeat for multiple roots. Defaults to .
  --limit <number>    Maximum number of files to return. Defaults to ${defaults.defaultLimit}.
  --depth <number>    Maximum traversal depth relative to each search root.
  --no-ignore         Include files excluded by ignore files.
  --visible-only      Exclude hidden files and directories.
  -h, --help          Show this help.
`.trim();
}

export const PI_GREP_DESCRIPTION =
  "Search file contents using ripgrep: rg --json -n -e '<regex>' -g '<glob>' <path(s)>";

export function createPiGrepHelp(defaults: GrepCliDefaults = DEFAULT_GREP_CLI_DEFAULTS): string {
  const limitPerFileDefault =
    defaults.defaultLimitPerFile === undefined ? '' : ` Defaults to ${defaults.defaultLimitPerFile}.`;
  return `
Usage: pi-grep --regexes <regex> [options]

Search file contents using ripgrep regular expressions.

Options:
  --regexes <regex>               Regular expression to search for. Repeat for multiple expressions.
  --paths <path>                  File or directory to search. Repeat for multiple paths. Defaults to .
  --globs <glob>                  Ripgrep-style glob filter. Repeat for multiple filters.
                                  Prefix exclusions with !.
  --limit <number>                Maximum matching lines to return globally. Defaults to ${defaults.defaultLimit}.
  --limit-per-file <number>       Maximum matching lines to return per file.${limitPerFileDefault}
  --depth <number>                Maximum traversal depth relative to each search path.
  --max-chars-per-match <number>  Maximum characters shown per matching line. Defaults to ${defaults.defaultMaxCharsPerMatch}.
  --no-ignore                     Include files excluded by ignore files.
  --visible-only                  Exclude hidden files and directories.
  -h, --help                      Show this help.
`.trim();
}

export const PI_FIND_HELP = createPiFindHelp();
export const PI_GREP_HELP = createPiGrepHelp();
