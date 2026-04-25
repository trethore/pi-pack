# pi-codexify

Codex-focused controls for pi.

## Features

- Mutates supported OpenAI Responses / Codex provider payloads with:
  - `text.verbosity`
  - `reasoning.summary`
- Adds `/codexify usage` to display Codex 5h and 7d usage windows from ChatGPT's Codex usage endpoint.

## Commands

```text
/codexify help
/codexify status
/codexify usage
/codexify verbosity low|medium|high|off
/codexify reasoning-summary auto|concise|detailed|none|off
```

Command changes are session-local. Persist defaults in `codexify.jsonc`.

## Configuration

Supported config locations:

- Global: `~/.pi/agent/codexify.jsonc`
- Project: `.pi/codexify.jsonc`

Project config overrides global config.

See [`codexify.example.jsonc`](./codexify.example.jsonc).
