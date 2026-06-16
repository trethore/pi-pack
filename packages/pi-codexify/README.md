# pi-codexify

Codex-focused controls.

## Features

- Mutates supported OpenAI Responses / Codex provider payloads with:
  - `text.verbosity`
  - `reasoning.summary`
  - `service_tier: "priority"` for OpenAI Codex Responses when `serviceTier` is `fast`
- Adds `/codexify usage` to display Codex 5h and 7d usage windows from ChatGPT's Codex usage endpoint.
- Adds `/codexify account ...` commands to save and switch multiple OpenAI Codex OAuth accounts while still using Pi's `/login openai-codex` flow.
- Adds the native OpenAI Codex `web_search` tool when `webSearch.enabled` is true.
- Adds `/codexify reset use|count` to consume one Codex usage reset credit or display the available reset token count when `reset.enabled` is true.

## Commands

```text
/codexify help
/codexify status
/codexify usage
/codexify account list
/codexify account current
/codexify account save <name>
/codexify account use <name>
/codexify account delete <name>
/codexify verbosity low|medium|high|off
/codexify reasoning-summary auto|concise|detailed|none|off
/codexify serviceTier slow|fast
/codexify reset use
/codexify reset count
```

Control commands update `pi-codexify.jsonc`. If a project config exists, commands update it; otherwise they update the global config.

Codex account commands store OAuth profile copies in `~/.pi/agent/pi-codexify-codex-accounts.json` and switch Pi's active `openai-codex` credential in `~/.pi/agent/auth.json`. Use Pi's normal login flow first:

```text
/login openai-codex
/codexify account save personal
/login openai-codex
/codexify account save work
/codexify account use personal
```

Account names may contain letters, numbers, dots, underscores, and dashes.

`/codexify reset use` uses the active `openai-codex` OAuth credential from Pi auth storage and posts to ChatGPT's Codex reset-credit endpoint. It asks for confirmation first because reset credits are rare and consumed by the request. `/codexify reset count` gets the available reset token count without consuming a token.

## Configuration

Supported config locations:

- Global: `~/.pi/agent/pi-codexify.jsonc`
- Project: `.pi/pi-codexify.jsonc`

Project config overrides global config.

For Codex controls, omitted values leave the provider payload unchanged. Setting a value to `null` also leaves the payload unchanged, and in project config it disables an inherited global override. `reasoningSummary: "none"` actively removes `reasoning.summary` from outgoing supported payloads while preserving other `reasoning` fields.

See [`pi-codexify.example.jsonc`](./pi-codexify.example.jsonc).
