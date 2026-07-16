# pi-toolmask

Disable pi tools with wildcard masks.

## Configuration

`pi-toolmask` reads JSONC config from:

1. `$PI_CODING_AGENT_DIR/pi-toolmask.jsonc` (defaults to `~/.pi/agent/pi-toolmask.jsonc`)
2. `.pi/pi-toolmask.jsonc`

Project config overrides global config. See [`pi-toolmask.example.jsonc`](./pi-toolmask.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "masks": ["bash", "write", "edit"],
  "enforceBeforeAgentStart": true,
  "notify": false,
}
```

## Features

### Tool masks

`masks` is an array of wildcard patterns matched against active tool names. Matching is case-sensitive. `*` matches any number of characters, and `!` at the start of a pattern keeps matching tools enabled.

Examples:

| Pattern  | Matches                    |
| -------- | -------------------------- |
| `read`   | Exactly `read`             |
| `*read`  | Names ending with `read`   |
| `read*`  | Names starting with `read` |
| `*read*` | Names containing `read`    |
| `*`      | Every active tool          |
| `!read`  | Keep `read` enabled        |

Disable all tools:

```jsonc
{
  "enabled": true,
  "masks": ["*"],
}
```

Disable every tool except `read`:

```jsonc
{
  "enabled": true,
  "masks": ["*", "!read"],
}
```

Negated masks are exceptions to positive masks. A config with only negated masks disables nothing.

Disable write-capable default tools:

```jsonc
{
  "enabled": true,
  "masks": ["bash", "write", "edit"],
}
```

Disable a family of extension tools:

```jsonc
{
  "enabled": true,
  "masks": ["mcp_*", "*danger*"],
}
```

### Enforcement timing

`pi-toolmask` applies masks on `session_start`. By default it also reapplies them on `before_agent_start` so tools registered or re-enabled by other extensions are masked before the next model request.

Set `enforceBeforeAgentStart` to `false` if you only want startup masking.

### Notifications

Set `notify` to `true` to display a Pi notification whenever `pi-toolmask` disables one or more active tools.
