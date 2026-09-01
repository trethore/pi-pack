# pi-toolbox

Useful file-editing tools for Pi.

## Features

- `apply_patch`: structured multi-file editing with the Codex patch format.

## Installation

Requires Pi `>=0.84.4 <1`.

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

The `apply_patch` tool is enabled by default.

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
}
```

## Tool reference

### `apply_patch`

Applies structured file edits using the Codex apply-patch format.

`*** Add File:` targets and `*** Move to:` destinations must not already exist. The operation is serialized with Pi's file mutation queue and rolls back completed writes if a later filesystem operation fails.

| Argument  | Required | Description                                                                               |
| --------- | -------- | ----------------------------------------------------------------------------------------- |
| `patch`   | Yes      | Patch text starting with `*** Begin Patch` and ending with `*** End Patch`.               |
| `workdir` | Yes      | Directory used to resolve relative paths, or `null` to use the current working directory. |

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

## License

[MIT](../../LICENSE)
