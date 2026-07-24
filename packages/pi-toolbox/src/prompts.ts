import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, formatSize } from '@earendil-works/pi-coding-agent';

const TOOL_OUTPUT_LIMIT_DESCRIPTION = `Output is truncated to ${DEFAULT_MAX_LINES} lines or ${formatSize(DEFAULT_MAX_BYTES)} (whichever is hit first). If truncated, the complete output is saved to a temporary file.`;

export const APPLY_PATCH_PROMPT = {
  tool: {
    description: [
      'Apply a patch using a simplified, file-oriented diff format.',
      'Patch must start with `*** Begin Patch` and end with `*** End Patch`. Supported hunks are `*** Add File:`, `*** Delete File:`, and `*** Update File:` with optional `*** Move to:`.',
      'Add targets and move destinations must not already exist.',
      'Automatically creates parent directories. Optionally, specify a working directory to resolve relative paths.',
    ].join('\n'),
    promptSnippet: 'Apply add, update, delete, and move file edits from a patch',
    promptGuidelines: [
      'Use `apply_patch` to edit file contents or file paths using the Codex apply_patch format.',
      'The `apply_patch` input must start with `*** Begin Patch\n` and end with `*** End Patch\n`.',
      '`apply_patch` supports `*** Add File:`, `*** Delete File:`, and `*** Update File:` hunks with optional `*** Move to:`.',
      '`apply_patch` requires add targets and move destinations not to exist.',
      'Relative paths passed to `apply_patch` are resolved against `workdir` when provided; otherwise, they are resolved against the current working directory.',
    ],
  },
  parameters: {
    patch: 'Patch to apply.',
    workdir:
      'Optional working directory for resolving relative paths in the patch. If omitted, paths are resolved against the current working directory.',
  },
};

export const FIND_FILES_PROMPT = {
  tool: {
    description: `Find files recursively under search roots using \`rg --files\`, optionally filtered by ripgrep-style glob patterns. ${TOOL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: 'Find files by path and filters',
    promptGuidelines: [
      'Use `find_files` for fast file discovery before reading or searching files.',
      'Use `find_files.paths` as search roots and `find_files.patterns` as optional `rg -g` filters.',
      '`find_files` always excludes `.git` internals from results.',
    ],
  },
  parameters: {
    patterns:
      'Optional ripgrep-style glob filter(s) passed with `-g`. Prefix with `!` to exclude. If omitted, all discovered files are returned.',
    paths: 'Search root(s). Provide one or more directories. If omitted, the current working directory is used.',
    limit: (defaultLimit: number) =>
      `Maximum number of files to return. If omitted, the default limit is ${defaultLimit}.`,
  },
};

export const GREP_PROMPT = {
  tool: {
    description: `Search file contents using ripgrep: rg --json -n -e '<regex>' -g '<glob>' <path(s)>. ${TOOL_OUTPUT_LIMIT_DESCRIPTION}`,
    promptSnippet: 'Search file contents by regex(es)',
    promptGuidelines: [
      'Use `grep` for fast content search when you know the text or regular expressions to find.',
      '`grep` always excludes `.git` internals from results.',
    ],
  },
  parameters: {
    regexes:
      'Ripgrep-compatible regex pattern(s) to search for. Provide one or more regexes; each regex is passed with `-e` and multiple regexes use OR semantics. Searches are line-oriented; inline flags like `(?i)` can be used.',
    paths:
      'Path(s) to search in. Provide one or more directories or files. If omitted, the current working directory is used.',
    globs: 'Glob filter(s) passed with `-g`. Prefix exclusions with `!`. If omitted, no glob filters are applied.',
    limit: (defaultLimit: number) =>
      `Maximum number of matching lines to return globally. If omitted, defaults to ${defaultLimit}.`,
    limitPerFile: (defaultLimitPerFile: number | undefined) =>
      `Maximum number of matching lines to return per file. If omitted, defaults to ${defaultLimitPerFile === undefined ? 'no per-file limit' : defaultLimitPerFile}.`,
    maxCharsPerMatch: (defaultMaxCharsPerMatch: number) =>
      `Maximum number of characters to show per matching line. If omitted, defaults to ${defaultMaxCharsPerMatch}.`,
  },
};

export const SEARCH_PROMPT = {
  parameters: {
    depth:
      'Maximum directory traversal depth relative to each search path. If provided, passes `--max-depth <depth>`. If omitted, traversal is unlimited.',
    noIgnore:
      'Include files ignored by .gitignore, .ignore, or other ripgrep ignore rules. If true, passes `--no-ignore`. If omitted or false, ignore rules remain active.',
    visibleOnly: 'Search only non-hidden files and directories. If omitted or false, hidden files are included.',
  },
};
