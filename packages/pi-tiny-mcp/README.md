# pi-tiny-mcp

Tiny and token-efficient MCP adapter for Pi.

## What it does

- Registers one compact `mcp` proxy tool instead of exposing every MCP tool by default.
- Can optionally register cached MCP tools directly when you want native tool calls.
- Starts MCP servers lazily unless configured otherwise.
- Caches tool metadata so search/list/describe can work without reconnecting every time.
- Reads standard MCP project/user files and Pi-specific JSONC config.

## Config files

Pi-specific config is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-tiny-mcp.jsonc` (defaults to `~/.pi/agent/pi-tiny-mcp.jsonc`)
2. `<project>/.pi/pi-tiny-mcp.jsonc`

Standard MCP servers are also read by default from:

1. `~/.config/mcp/mcp.json`
2. `<project>/.mcp.json`

Pi-specific server entries override standard MCP entries by server name.

## Example

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

Set `directTools.enabled` to `true` to register cached MCP tools as Pi tools. Set `servers.<name>.directTools` to override this per server. `directTools.disableProxyTool` hides the `mcp` proxy only when all direct-enabled servers have valid cached metadata.

## Commands

```text
/mcp
/mcp status
/mcp tools [server]
/mcp reconnect <server>
/mcp refresh [server]
/mcp cache clear
/mcp-auth <server>
/mcp-auth <server> <authorization-code-or-redirect-url>
```
