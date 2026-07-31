# pi-bash-commands

Expose bundled and configured commands only to Pi's active built-in bash tool.

## Features

- Adds command shims to PATH only for LLM-issued bash tool calls.
- Includes `pi-find` and `pi-grep`, compact ripgrep-powered search commands.
- Leaves the Pi process, parent shell, and user `!`/`!!` commands unchanged.
- Supports fixed arguments and per-command environment variables.
- Optionally describes selected commands in the system prompt.
- Disables itself with a warning when Pi's built-in bash tool is inactive, missing, or overridden.

## Installation

Requires Pi `>=0.83.0 <1`.

From the `pi-pack` repository root:

```sh
pi install ./packages/pi-bash-commands
```

For the current project only:

```sh
pi install -l ./packages/pi-bash-commands
```

For development:

```sh
pi -e ./packages/pi-bash-commands
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-bash-commands.jsonc`, defaulting to `~/.pi/agent/pi-bash-commands.jsonc`
2. `<project>/.pi/pi-bash-commands.jsonc` when the project is trusted

When project configuration defines `commands`, it replaces the global command array. See [`pi-bash-commands.example.jsonc`](./pi-bash-commands.example.jsonc) for a copyable example.

```jsonc
{
  "enabled": true,
  "builtIns": true,
  "commands": [
    {
      "enabled": true,
      "name": "example-name",
      "command": "/absolute/path/to/node",
      "args": ["/absolute/path/to/example-cli.js"],
      "env": { "EXAMPLE_MODE": "pi" },
      "prompt": {
        "description": "Run the example project helper.",
        "usage": "example-name [options]",
      },
    },
  ],
}
```

`builtIns` controls the commands bundled with this extension:

```jsonc
{
  // Enable every bundled command. This is the default.
  "builtIns": true,
}
```

```jsonc
{
  // Disable every bundled command while retaining configured commands.
  "builtIns": false,
}
```

```jsonc
{
  // An object is an allowlist. Omitted commands are disabled.
  "builtIns": {
    "pi-grep": true,
  },
}
```

Available built-ins are `pi-find` and `pi-grep`. Their names are reserved and cannot be used by configured commands. When project configuration defines `builtIns`, it replaces the inherited global built-in selection.

`command` must be an absolute executable path. `args`, `env`, and `prompt` are optional. Arguments supplied in a bash call are appended after configured fixed arguments.

Command names must contain only letters, digits, `.`, `_`, `+`, and `-`, and must start with a letter or digit. Environment variable names must be valid shell identifiers.

## Prompt guidance

Only commands with a populated `prompt.description` or `prompt.usage` are added to the system prompt:

```md
## Bash Commands

### example-name

Description: Run the example project helper.

Usage: example-name [options]
```

Commands without prompt metadata remain available. Their purpose can be provided by the user or discovered through `-h`, `--help`, or equivalent help output.

Multiline descriptions are displayed below a `Description:` heading. Multiline usage values are inserted verbatim, allowing a command's `--help` output to be used directly as prompt guidance.

## Built-in commands

Both commands use the ripgrep executable provided by `@vscode/ripgrep`. List options are repeatable.

### `pi-find`

```text
Usage: pi-find [options]

Find files recursively under search roots using rg --files.

Options:
  --patterns <glob>   Ripgrep-style glob filter. Repeat for multiple filters.
                      Prefix exclusions with !.
  --paths <path>      Search root. Repeat for multiple roots. Defaults to .
  --limit <number>    Maximum number of files to return. Defaults to 100.
  --depth <number>    Maximum traversal depth relative to each search root.
  --no-ignore         Include files excluded by ignore files.
  --visible-only      Exclude hidden files and directories.
  -h, --help          Show this help.
```

### `pi-grep`

```text
Usage: pi-grep --regexes <regex> [options]

Search file contents using ripgrep regular expressions.

Options:
  --regexes <regex>               Regular expression to search for. Repeat for multiple expressions.
  --paths <path>                  File or directory to search. Repeat for multiple paths. Defaults to .
  --globs <glob>                  Ripgrep-style glob filter. Repeat for multiple filters.
                                  Prefix exclusions with !.
  --limit <number>                Maximum matching lines to return globally. Defaults to 200.
  --limit-per-file <number>       Maximum matching lines to return per file.
  --depth <number>                Maximum traversal depth relative to each search path.
  --max-chars-per-match <number>  Maximum characters shown per matching line. Defaults to 200.
  --no-ignore                     Include files excluded by ignore files.
  --visible-only                  Exclude hidden files and directories.
  -h, --help                      Show this help.
```

The commands enforce their requested result limits but do not apply Pi tool-output truncation or persist overflow to temporary files. Final output handling belongs to the Bash tool.

## Scope and limitations

The extension modifies PATH inside Pi's built-in LLM-callable bash process. It does not modify `process.env`, the parent shell, or user-entered `!`/`!!` commands. Child processes inherit the injected PATH unless a command resets or replaces it.

Custom or overridden tools named `bash` are intentionally unsupported because local shim files may not exist in remote or containerized execution environments.

## License

[MIT](../../LICENSE)
