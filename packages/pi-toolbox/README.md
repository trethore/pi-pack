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
  "glob": {
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

### Glob tool

Registers `glob`, a low-token file discovery tool powered by `rg --files -g`.

Arguments:

- `patterns`: glob pattern(s) passed to `rg -g`; provide one or more patterns; use `!` for exclusions
- `paths`: directories to search in, defaults to cwd
- `limit`: maximum files to return, defaults to `glob.defaultLimit`, minimum `1`, maximum `1000`
- `depth`: maximum directory traversal depth relative to each search path, passed as `--max-depth`; omitted for unlimited traversal, minimum `1`
- `noIgnore`: ignore `.gitignore` and `.ignore` with `--no-ignore`, defaults to `false`
- `visibleOnly`: search only non-hidden files and directories, defaults to `false`; hidden files are included by default while `.git` internals are always excluded

Example output:

```text
found=4
src/
  index.ts
  agent/
    glob.ts
    tools.ts
test/glob.test.ts
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

Example output:

```text
matches=5 files=2

src/agent/tools.ts
12: export const globTool = ...
18: export const grepTool = ...
25: very long line clipped by maxCharsPerMatch
[more matches in this file]

src/index.ts
4: import { grepTool } from "./agent/tools"
9: tools: [globTool, grepTool]

[more matches available]
```

When more matches exist beyond `limit`, the output ends with `[more matches available]`. When more matches exist beyond `limitPerFile`, the file section ends with `[more matches in this file]`. Long matching lines are clipped to `maxCharsPerMatch` without an extra marker.
