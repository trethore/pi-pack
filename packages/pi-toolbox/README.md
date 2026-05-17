# pi-toolbox

Various and useful tools for Pi.

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

- `pattern`: glob pattern passed to `rg -g`
- `path`: directory to run in, defaults to cwd
- `limit`: maximum files to return, defaults to `glob.defaultLimit`, minimum `1`, maximum `1000`
- `noIgnore`: ignore `.gitignore` and `.ignore` with `--no-ignore`, defaults to `false`
- `visibleOnly`: search only non-hidden files and directories, defaults to `false`; hidden files are included by default while `.git` internals are always excluded

Example output:

```text
base=. count=4
src/
  index.ts
  agent/
    glob.ts
    tools.ts
test/
  glob.test.ts
```

When more files exist beyond `limit`, the output ends with `[more files available]`.

### Grep tool

Registers `grep`, a low-token content search tool powered by `rg -n`.

Arguments:

- `regex`: regex pattern to search for
- `path`: directory or file to search in, defaults to cwd
- `limit`: maximum matching lines to return, defaults to `grep.defaultLimit`, minimum `1`, maximum `1000`
- `limitPerFile`: maximum matching lines to return per file, defaults to `grep.defaultLimitPerFile` when configured, otherwise no per-file limit
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
