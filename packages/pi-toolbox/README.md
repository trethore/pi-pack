# pi-toolbox

Useful file-editing and search tools for Pi.

## Features

- `apply_patch`: structured multi-file editing with the Codex patch format.
- `find_files`: low-token file discovery powered by `rg --files`.
- `grep`: low-token content search powered by `rg --json -n`.
- Configurable result limits and output clipping.

## Installation

Requires Pi `>=0.80.8 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-toolbox
```

Or install for the current project:

```sh
pi install -l ./packages/pi-toolbox
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-toolbox
```

## Quick start

All tools are enabled by default. After loading the extension, Pi can call `apply_patch`, `find_files`, and `grep` directly.

Example `find_files` arguments:

```jsonc
{
  "patterns": ["**/*.ts", "!**/*.d.ts"],
  "paths": ["src", "test"],
  "depth": 2,
}
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-toolbox.jsonc` (defaults to `~/.pi/agent/pi-toolbox.jsonc`)
2. `<project>/.pi/pi-toolbox.jsonc`

Project configuration overrides global configuration. See [`pi-toolbox.example.jsonc`](./pi-toolbox.example.jsonc) for a copyable configuration.

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

## Tool reference

### `apply_patch`

Applies structured file edits using the Codex apply-patch format.

| Argument  | Required | Description                                                                                                          |
| --------- | -------- | -------------------------------------------------------------------------------------------------------------------- |
| `patch`   | Yes      | Patch text starting with `*** Begin Patch` and ending with `*** End Patch`.                                          |
| `workdir` | No       | Directory used to resolve relative paths. Defaults to the current working directory; absolute paths remain absolute. |

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

### `find_files`

Discovers files with `rg --files`.

| Argument      | Required | Default                  | Description                                                                 |
| ------------- | -------- | ------------------------ | --------------------------------------------------------------------------- |
| `patterns`    | No       | All files                | Ripgrep-style glob filters passed with `-g`; prefix exclusions with `!`.    |
| `paths`       | No       | Current directory        | Search root directories.                                                    |
| `limit`       | No       | `findFiles.defaultLimit` | Maximum files to return, from `1` to `1000`.                                |
| `depth`       | No       | Unlimited                | Maximum traversal depth relative to each search root.                       |
| `noIgnore`    | No       | `false`                  | Include files ignored by `.gitignore` and `.ignore`.                        |
| `visibleOnly` | No       | `false`                  | Exclude hidden files and directories. `.git` internals are always excluded. |

Example calls:

```jsonc
// Find TypeScript files two levels deep, excluding declarations.
{ "patterns": ["**/*.ts", "!**/*.d.ts"], "paths": ["src", "test"], "depth": 2 }

// Include ignored files but keep hidden files and directories excluded.
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

### `grep`

Searches file contents with `rg --json -n`.

| Argument           | Required | Default                         | Description                                                                 |
| ------------------ | -------- | ------------------------------- | --------------------------------------------------------------------------- |
| `regexes`          | Yes      | -                               | Regex patterns passed with `-e`.                                            |
| `paths`            | No       | Current directory               | Directories or files to search.                                             |
| `globs`            | No       | All files                       | Glob filters passed with `-g`; prefix exclusions with `!`.                  |
| `limit`            | No       | `grep.defaultLimit`             | Maximum matching lines to return, from `1` to `1000`.                       |
| `limitPerFile`     | No       | Configured default or unlimited | Maximum matching lines to return per file.                                  |
| `depth`            | No       | Unlimited                       | Maximum traversal depth relative to each search root.                       |
| `maxCharsPerMatch` | No       | `grep.defaultMaxCharsPerMatch`  | Maximum characters per matching line, from `100` to `2000`.                 |
| `noIgnore`         | No       | `false`                         | Include files ignored by `.gitignore` and `.ignore`.                        |
| `visibleOnly`      | No       | `false`                         | Exclude hidden files and directories. `.git` internals are always excluded. |

Example calls:

```jsonc
// Search TypeScript sources, excluding tests, with per-file limiting.
{
  "regexes": ["TODO|FIXME"],
  "paths": ["src"],
  "globs": ["**/*.ts", "!**/*.test.ts"],
  "limitPerFile": 3,
}

// Search ignored files but skip hidden files and directories.
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
4: import { grepTool } from "#src/agent/tools"
9: tools: [findFilesTool, grepTool]
[more matches available]
```

When more matches exist beyond `limit`, the output ends with `[more matches available]`. When more matches exist beyond `limitPerFile`, the file section ends with `[more matches in this file]`. Long matching lines are clipped to `maxCharsPerMatch` without an extra marker.

## License

[MIT](../../LICENSE)
