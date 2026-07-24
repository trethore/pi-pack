# pi-codexify

Codex settings, tools, and usage controls.

## Features

- Controls supported OpenAI Responses payload settings:
  - `text.verbosity`
  - `reasoning.summary`
  - `service_tier: "priority"` when `serviceTier` is `priority`
- Displays Codex 5h and 7d usage windows.
- Adds the native OpenAI Codex `web_search` tool when enabled.
- Consumes or inspects Codex reset credits.

## Installation

Requires Pi `>=0.82.0 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-codexify
```

Or install for the current project:

```sh
pi install -l ./packages/pi-codexify
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-codexify
```

## Quick start

Run `/codexify status` to inspect the active controls, then update them with commands such as:

```text
/codexify verbosity medium
/codexify reasoning-summary auto
/codexify service-tier default
```

Commands persist control changes to the active configuration file.

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-codexify.jsonc` (defaults to `~/.pi/agent/pi-codexify.jsonc`)
2. `<project>/.pi/pi-codexify.jsonc`

Project configuration overrides global configuration when the project is trusted. See [`pi-codexify.example.jsonc`](./pi-codexify.example.jsonc) for a copyable configuration.

```jsonc
{
  "enabled": true,
  "controls": {
    "enabled": true,
    "verbosity": "medium",
    "reasoningSummary": "auto",
    "serviceTier": "default",
    "webSearch": true,
  },
  "usage": true,
  "reset": true,
}
```

Everything under `controls` modifies outgoing provider payloads. Setting `controls.enabled` to `false` disables all payload modifications, including native web search.

Omitted or `null` optional control values leave the provider payload unchanged. In project configuration, `null` disables an inherited global override. `reasoningSummary: "none"` actively removes `reasoning.summary` while preserving other reasoning fields. The `usage` and `reset` booleans control their corresponding subcommands.

## Commands

```text
/codexify help
/codexify status
/codexify usage
/codexify verbosity low|medium|high|off
/codexify reasoning-summary auto|concise|detailed|none|off
/codexify service-tier default|priority
/codexify reset use
/codexify reset details
```

Control commands update the trusted project configuration when one exists; otherwise they update the global configuration.

`/codexify usage` and `/codexify reset` use Pi's active `openai-codex` OAuth credential. Use `/login openai-codex` to change it.

`/codexify reset use` asks for confirmation because the request consumes a reset credit. `/codexify reset details` is read-only.

## Behavior and limitations

Priority service tier is applied at the final provider payload layer. Pi may report default-tier pricing if the provider response does not echo the effective priority tier.

## License

[MIT](../../LICENSE)
