export const PI_FIND_DESCRIPTION =
  'Find files recursively under search roots using rg --files, optionally filtered by ripgrep-style glob patterns.';

export const PI_FIND_HELP = `
Usage: pi-find [options]

Find files recursively under search roots using rg --files.

Options:
  --patterns <glob>   Ripgrep-style glob filter. Repeat for multiple filters.
                      Prefix exclusions with !.
  --paths <path>      Search root. Repeat for multiple roots. Defaults to .
  --limit <number>    Maximum number of files to return. Defaults to ${DEFAULT_FIND_LIMIT}.
  --depth <number>    Maximum traversal depth relative to each search root.
  --no-ignore         Include files excluded by ignore files.
  --visible-only      Exclude hidden files and directories.
  -h, --help          Show this help.
`.trim();

export const PI_GREP_DESCRIPTION =
  "Search file contents using ripgrep: rg --json -n -e '<regex>' -g '<glob>' <path(s)>";

export const PI_GREP_HELP = `
Usage: pi-grep --regexes <regex> [options]

Search file contents using ripgrep regular expressions.

Options:
  --regexes <regex>               Regular expression to search for. Repeat for multiple expressions.
  --paths <path>                  File or directory to search. Repeat for multiple paths. Defaults to .
  --globs <glob>                  Ripgrep-style glob filter. Repeat for multiple filters.
                                  Prefix exclusions with !.
  --limit <number>                Maximum matching lines to return globally. Defaults to ${DEFAULT_GREP_LIMIT}.
  --limit-per-file <number>       Maximum matching lines to return per file.
  --depth <number>                Maximum traversal depth relative to each search path.
  --max-chars-per-match <number>  Maximum characters shown per matching line. Defaults to ${DEFAULT_MAX_CHARS_PER_MATCH}.
  --no-ignore                     Include files excluded by ignore files.
  --visible-only                  Exclude hidden files and directories.
  -h, --help                      Show this help.
`.trim();
import {
  DEFAULT_FIND_LIMIT,
  DEFAULT_GREP_LIMIT,
  DEFAULT_MAX_CHARS_PER_MATCH,
} from '#pi-bash-commands-cli/shared/constants';
