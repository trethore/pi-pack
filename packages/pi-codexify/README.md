# pi-codexify

Codex-focused controls.

## Features

- Mutates supported OpenAI Responses payloads with:
  - `text.verbosity`
  - `reasoning.summary`
  - `service_tier: "priority"` when `serviceTier` is `priority`
- Adds `/codexify usage` to display Codex 5h and 7d usage windows.
- Adds the native OpenAI Codex `web_search` tool when `webSearch.enabled` is true.
- Adds `/codexify reset use|details` to consume or inspect Codex reset credits.

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

Control commands update `pi-codexify.jsonc`. If a trusted project config exists, commands update it; otherwise they update the global config.

`/codexify usage` and `/codexify reset` use Pi's active `openai-codex` OAuth credential. Use `/login openai-codex` to change it.

`/codexify reset use` asks for confirmation because the request consumes a reset credit. `/codexify reset details` is read-only.

## Configuration

Supported config locations:

- Global: `$PI_CODING_AGENT_DIR/pi-codexify.jsonc` (defaults to `~/.pi/agent/pi-codexify.jsonc`)
- Project: `.pi/pi-codexify.jsonc`

Project config overrides global config when the project is trusted.

Omitted or `null` control values leave the provider payload unchanged. In project config, `null` disables an inherited global override. `reasoningSummary: "none"` actively removes `reasoning.summary` while preserving other reasoning fields.

Priority service tier is applied at the final provider payload layer. Pi may report default-tier pricing if the provider response does not echo the effective priority tier.

See [`pi-codexify.example.jsonc`](./pi-codexify.example.jsonc).
