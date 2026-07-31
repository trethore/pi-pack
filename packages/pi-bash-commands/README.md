# pi-bash-commands

Expose configured commands only to Pi's active built-in bash tool.

## Features

- Adds command shims to PATH only for LLM-issued bash tool calls.
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

## Scope and limitations

The extension modifies PATH inside Pi's built-in LLM-callable bash process. It does not modify `process.env`, the parent shell, or user-entered `!`/`!!` commands. Child processes inherit the injected PATH unless a command resets or replaces it.

Custom or overridden tools named `bash` are intentionally unsupported because local shim files may not exist in remote or containerized execution environments.

## License

[MIT](../../LICENSE)
