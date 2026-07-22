# pi-tiny-mcp

Tiny and token-efficient MCP adapter for Pi.

## Features

- Registers one compact `mcp` proxy tool instead of exposing every MCP tool by default.
- Optionally registers cached MCP tools directly for native tool calls.
- Starts MCP servers lazily unless configured otherwise.
- Caches tool metadata so search, list, and describe operations can work without reconnecting.
- Reads standard MCP files and Pi-specific JSONC configuration.
- Supports local, HTTP, bearer-authenticated, and OAuth MCP servers.

## Installation

Requires Pi `>=0.81.1 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-tiny-mcp
```

Or install for the current project:

```sh
pi install -l ./packages/pi-tiny-mcp
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-tiny-mcp
```

## Quick start

Create `.pi/pi-tiny-mcp.jsonc`:

```jsonc
{
  "enabled": true,
  "servers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
    },
  },
}
```

List the configured servers and search their cached tools:

```ts
mcp({});
mcp({ search: 'screenshot' });
```

## Configuration

Pi-specific configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-tiny-mcp.jsonc` (defaults to `~/.pi/agent/pi-tiny-mcp.jsonc`)
2. `<project>/.pi/pi-tiny-mcp.jsonc`

Standard MCP servers are also loaded by default from:

1. `~/.config/mcp/mcp.json`
2. `<project>/.mcp.json`

Pi-specific server entries override standard MCP entries by server name. See [`pi-tiny-mcp.example.jsonc`](./pi-tiny-mcp.example.jsonc) for a copyable configuration.

```jsonc
{
  "enabled": true,
  "proxyTool": {
    "enabled": true,
    "name": "mcp",
    "includeSchemasInSearch": true,
  },
  "directTools": {
    "enabled": false,
    "disableProxyTool": false,
  },
  "metadataCache": {
    "enabled": true,
    "maxAgeHours": 168,
  },
  "lifecycle": {
    "defaultMode": "lazy",
    "idleTimeoutMinutes": 10,
  },
  "servers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"],
      "lifecycle": "lazy",
      "directTools": false,
    },
    "remote": {
      "url": "https://mcp.example.com/mcp",
      "headers": { "X-Api-Key": "${MCP_API_KEY}" },
      "auth": "bearer",
      "bearerTokenEnv": "MCP_TOKEN",
    },
    "oauth-remote": {
      "url": "https://mcp.example.com/mcp",
      "auth": "oauth",
    },
  },
}
```

## Proxy tool usage

```ts
mcp({});
mcp({ search: 'screenshot' });
mcp({ server: 'chrome-devtools' });
mcp({ describe: 'chrome_devtools_take_screenshot' });
mcp({ connect: 'chrome-devtools' });
mcp({ refresh: 'chrome-devtools' });
mcp({ refresh: 'all' });
mcp({ tool: 'chrome_devtools_take_screenshot', args: '{"format":"png"}' });
```

`args` must be a JSON object string.

## Direct tools

Set `directTools.enabled` to `true` to register cached MCP tools as Pi tools. Set `servers.<name>.directTools` to override this per server.

`directTools.disableProxyTool` hides the `mcp` proxy only when all direct-enabled servers have valid cached metadata.

## Lifecycle and caching

`lifecycle.defaultMode` controls when servers start and stop:

- `lazy`: start on first use.
- `eager`: start when the extension loads.
- `keep-alive`: keep the server running.

`metadataCache` preserves tool metadata for search, list, describe, and direct-tool registration. Set `metadataCache.maxAgeHours` to `0` to disable age-based expiration.

## Commands

| Command                                                   | Purpose                                                |
| --------------------------------------------------------- | ------------------------------------------------------ |
| `/mcp`                                                    | Display MCP status.                                    |
| `/mcp status`                                             | Display configured server status.                      |
| `/mcp tools [server]`                                     | List cached tools for all servers or one server.       |
| `/mcp reconnect <server>`                                 | Disconnect and reconnect a server.                     |
| `/mcp refresh [server]`                                   | Refresh cached metadata for all servers or one server. |
| `/mcp cache clear`                                        | Clear cached MCP metadata.                             |
| `/mcp-auth <server>`                                      | Start OAuth authorization for a server.                |
| `/mcp-auth <server> <authorization-code-or-redirect-url>` | Complete OAuth authorization.                          |

## Security

MCP servers can execute tools and access resources with the permissions of their process or remote credentials. Only configure servers and commands you trust.

Server fields such as headers, tokens, working directories, and environment values can reference environment variables. Avoid storing secrets directly in project configuration committed to source control.

## License

[MIT](../../LICENSE)
