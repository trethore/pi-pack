# pi-toolbox

Various and useful tools.

## Configuration

`pi-toolbox` reads JSONC config from:

1. `~/.pi/agent/pi-toolbox.jsonc`
2. `.pi/pi-toolbox.jsonc`

Project config overrides global config. See [`pi-toolbox.example.jsonc`](./pi-toolbox.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "applyPatch": {
    "enabled": true,
  },
  "findFiles": {
    "enabled": true,
    "defaultLimit": 100,
  },
  "grep": {
    "enabled": true,
    "defaultLimit": 200,
    // Omit defaultLimitPerFile for no per-file default limit.
    // "defaultLimitPerFile": 30,
    "defaultMaxCharsPerMatch": 200,
  },
}
```

## Features

### Apply patch tool

Registers `apply_patch`, a structured file editing tool that applies the Codex apply-patch format.

Arguments:

- `patch`: patch text starting with `*** Begin Patch` and ending with `*** End Patch`
- `workdir`: optional directory used to resolve relative paths in the patch; defaults to cwd; absolute paths remain absolute

Example call:

```jsonc
{
  "workdir": "packages/pi-toolbox",
  "patch": "*** Begin Patch\n*** Update File: README.md\n@@\n-old\n+new\n*** End Patch",
}
```

Example output:

```text
Success. Updated the following files:
M README.md
```

### Find files tool

Registers `find_files`, a low-token file discovery tool powered by `rg --files`.

Arguments:

- `patterns`: optional ripgrep-style glob filters passed with `-g`; prefix with `!` for exclusions; omitted to return all discovered files
- `paths`: search root directories, defaults to cwd
- `limit`: maximum files to return, defaults to `findFiles.defaultLimit`, minimum `1`, maximum `1000`
- `depth`: maximum directory traversal depth relative to each search path, passed as `--max-depth`; omitted for unlimited traversal, minimum `1`
- `noIgnore`: ignore `.gitignore` and `.ignore` with `--no-ignore`, defaults to `false`
- `visibleOnly`: search only non-hidden files and directories, defaults to `false`; hidden files are included by default while `.git` internals are always excluded

Example calls:

```jsonc
// Find TypeScript files two levels deep, excluding declarations.
{ "patterns": ["**/*.ts", "!**/*.d.ts"], "paths": ["src", "test"], "depth": 2 }

// Include ignored files but keep hidden files/directories excluded.
{ "patterns": ["**/*"], "noIgnore": true, "visibleOnly": true }
```

Example output:

```text
found=4
src/
  index.ts
  agent/
    find-files.ts
    tools.ts
test/find-files.test.ts
[more files available]
```

When more files exist beyond `limit`, the output ends with `[more files available]`.

### Grep tool

Registers `grep`, a low-token content search tool powered by `rg --json -n`.

Arguments:

- `regexes`: regex pattern(s) to search for; provide one or more regexes, passed as `-e`
- `paths`: directories or files to search in, defaults to cwd
- `globs`: glob filter(s) for files to search; passed as `-g`; use `!` for exclusions
- `limit`: maximum matching lines to return, defaults to `grep.defaultLimit`, minimum `1`, maximum `1000`
- `limitPerFile`: maximum matching lines to return per file, defaults to `grep.defaultLimitPerFile` when configured, otherwise no per-file limit
- `depth`: maximum directory traversal depth relative to each search path, passed as `--max-depth`; omitted for unlimited traversal, minimum `1`
- `maxCharsPerMatch`: maximum chars per matching line, defaults to `grep.defaultMaxCharsPerMatch`, minimum `100`, maximum `2000`
- `noIgnore`: ignore `.gitignore` and `.ignore` with `--no-ignore`, defaults to `false`
- `visibleOnly`: search only non-hidden files and directories, defaults to `false`; hidden files are included by default while `.git` internals are always excluded

Example calls:

```jsonc
// Search TypeScript sources, excluding tests, with per-file limiting.
{ "regexes": ["TODO|FIXME"], "paths": ["src"], "globs": ["**/*.ts", "!**/*.test.ts"], "limitPerFile": 3 }

// Search ignored files but skip hidden files/directories.
{ "regexes": ["API_KEY"], "noIgnore": true, "visibleOnly": true }
```

Example output:

```text
matches=5 files=2

src/agent/tools.ts
12: export const findFilesTool = ...
18: export const grepTool = ...
25: very long line clipped by maxCharsPerMatch, once it hits the char limit, it ends: abcdefabcdefabcd
[more matches in this file]

src/index.ts
4: import { grepTool } from "./agent/tools"
9: tools: [findFilesTool, grepTool]

[more matches available]
```

When more matches exist beyond `limit`, the output ends with `[more matches available]`. When more matches exist beyond `limitPerFile`, the file section ends with `[more matches in this file]`. Long matching lines are clipped to `maxCharsPerMatch` without an extra marker.
