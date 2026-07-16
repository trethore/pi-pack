# pi-handy

Handy controls and diagnostics for Pi.

## Features

- Inspects or changes the active model thinking level.
- Displays the active system prompt and tool schemas.
- Dumps the next provider request payload.
- Reports the total duration of an agent run.

## Installation

Requires Pi `>=0.80.8 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-handy
```

Or install for the current project:

```sh
pi install -l ./packages/pi-handy
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-handy
```

## Quick start

All features are enabled by default. After loading the extension, try:

```text
/thinkinglevel
/showsysprompt
/payloaddump
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-handy.jsonc` (defaults to `~/.pi/agent/pi-handy.jsonc`)
2. `<project>/.pi/pi-handy.jsonc`

Project configuration overrides global configuration. See [`pi-handy.example.jsonc`](./pi-handy.example.jsonc) for a copyable configuration.

Set the top-level `enabled` field to `false` to disable the extension without changing individual feature settings.

```jsonc
{
  "enabled": true,
  "thinkingLevel": {
    "enabled": true,
  },
  "showSysprompt": {
    "enabled": true,
  },
  "payloadDump": {
    "enabled": true,
  },
  "timeTaken": {
    "enabled": true,
  },
}
```

## Commands

| Command                          | Purpose                                                          |
| -------------------------------- | ---------------------------------------------------------------- |
| `/thinkinglevel [level]`         | Inspect or set the current model thinking level.                 |
| `/showsysprompt [prompt\|tools]` | Display the current system prompt, active tool schemas, or both. |
| `/payloaddump`                   | Dump the next LLM provider request payload.                      |

## Feature reference

### Thinking level

`/thinkinglevel [level]` inspects or sets the current model thinking level from the prompt. Without an argument, it shows the current level and the levels supported by the active model.

```text
/thinkinglevel medium
/thinkinglevel off
/thinkinglevel
```

### System prompt display

`/showsysprompt [prompt|tools]` displays the current system prompt and schemas for the active tools. Without arguments, it shows both. Use `prompt` or `tools` to show only that section.

The output is stored as display-only session entries and is never added to LLM context.

```text
/showsysprompt
/showsysprompt prompt
/showsysprompt tools
```

### Payload dump

`/payloaddump` dumps the next LLM provider request payload to `$PI_CODING_AGENT_DIR/.payload-dump-<ISO-TIMESTAMP>`. `PI_CODING_AGENT_DIR` defaults to `~/.pi/agent`.

Colons in the timestamp are replaced with hyphens so the filename works on Windows.

### Time taken notification

The notification appears after the full agent run settles and the prompt returns to the user, including automatic retries, compaction retries, and queued continuations.

```text
Took 42s
Took 1m5s
```

## License

[MIT](../../LICENSE)
