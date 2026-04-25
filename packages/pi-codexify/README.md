# pi-codexify

Codex-focused controls for pi.

## Features

- Mutates supported OpenAI Responses / Codex provider payloads with:
  - `text.verbosity`
  - `reasoning.summary`
- Adds `/codexify usage` to display Codex 5h and 7d usage windows from ChatGPT's Codex usage endpoint.
- Adds the native OpenAI Codex `web_search` tool when `webSearch.enabled` is true.

## Commands

```text
/codexify help
/codexify status
/codexify usage
/codexify verbosity low|medium|high|off
/codexify reasoning-summary auto|concise|detailed|none|off
```

Control commands update `pi-codexify.jsonc`. If a project config exists, commands update it; otherwise they update the global config.

## Configuration

Supported config locations:

- Global: `~/.pi/agent/pi-codexify.jsonc`
- Project: `.pi/pi-codexify.jsonc`

Project config overrides global config.

See [`codexify.example.jsonc`](./codexify.example.jsonc).
