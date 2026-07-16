# pi-toolmask

Wildcard masks for disabling Pi tools.

## Features

- Disables active tools with case-sensitive wildcard patterns.
- Supports negated masks that keep matching tools enabled.
- Reapplies masks before agent runs when configured.
- Optionally notifies when tools are disabled.

## Installation

Requires Pi `>=0.80.8 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-toolmask
```

Or install for the current project:

```sh
pi install -l ./packages/pi-toolmask
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-toolmask
```

## Quick start

Create `.pi/pi-toolmask.jsonc` to disable every tool except `read`:

```jsonc
{
  "enabled": true,
  "masks": ["*", "!read"],
}
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-toolmask.jsonc` (defaults to `~/.pi/agent/pi-toolmask.jsonc`)
2. `<project>/.pi/pi-toolmask.jsonc`

Project configuration overrides global configuration. See [`pi-toolmask.example.jsonc`](./pi-toolmask.example.jsonc) for a copyable configuration.

```jsonc
{
  "enabled": true,
  "masks": ["bash", "write", "edit"],
  "enforceBeforeAgentStart": true,
  "notify": false,
}
```

## Mask patterns

`masks` is an array of wildcard patterns matched against active tool names. Matching is case-sensitive. `*` matches any number of characters, and `!` at the start of a pattern keeps matching tools enabled.

| Pattern  | Matches                     |
| -------- | --------------------------- |
| `read`   | Exactly `read`.             |
| `*read`  | Names ending with `read`.   |
| `read*`  | Names starting with `read`. |
| `*read*` | Names containing `read`.    |
| `*`      | Every active tool.          |
| `!read`  | Keeps `read` enabled.       |

Negated masks are exceptions to positive masks. A configuration with only negated masks disables nothing. Tools that do not match a positive mask remain enabled.

### Disable all tools

```jsonc
{
  "enabled": true,
  "masks": ["*"],
}
```

### Disable every tool except `read`

```jsonc
{
  "enabled": true,
  "masks": ["*", "!read"],
}
```

### Disable write-capable default tools

```jsonc
{
  "enabled": true,
  "masks": ["bash", "write", "edit"],
}
```

### Disable a family of extension tools

```jsonc
{
  "enabled": true,
  "masks": ["mcp_*", "*danger*"],
}
```

## Enforcement timing

Masks are applied on `session_start`. By default, they are also reapplied on `before_agent_start` so tools registered or re-enabled by other extensions are masked before the next model request.

Set `enforceBeforeAgentStart` to `false` to apply masks only at startup.

## Notifications

Set `notify` to `true` to display a Pi notification whenever one or more active tools are disabled.

## License

[MIT](../../LICENSE)
