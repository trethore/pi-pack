# pi-handy

Handy features.

## Configuration

`pi-handy` reads JSONC config from:

1. `$PI_CODING_AGENT_DIR/pi-handy.jsonc` (defaults to `~/.pi/agent/pi-handy.jsonc`)
2. `.pi/pi-handy.jsonc`

Project config overrides global config. See [`pi-handy.example.jsonc`](./pi-handy.example.jsonc) for a copyable template.
All features are enabled by default. Set the top-level `enabled` field to `false` to disable the extension without changing individual feature settings.

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

## Features

### Thinking level command

Registers `/thinkinglevel [level]` to inspect or set the current model thinking level from the prompt.
Without an argument, it shows the current level and the levels supported by the active model.

Examples:

```text
/thinkinglevel medium
/thinkinglevel off
/thinkinglevel
```

### Show system prompt command

Registers `/showsysprompt [prompt|tools]` to show the current system prompt and schemas for the active tools in Pi.
Without arguments, it shows both. Use `prompt` or `tools` to show only that section.
The output is stored as display-only session entries and is never added to LLM context.

Examples:

```text
/showsysprompt
/showsysprompt prompt
/showsysprompt tools
```

### Payload dump command

Registers `/payloaddump` to dump the next LLM provider request payload to `$PI_CODING_AGENT_DIR/.payload-dump-<ISO-TIMESTAMP>`.
`PI_CODING_AGENT_DIR` defaults to `~/.pi/agent`.
Colons in the timestamp are replaced with hyphens so the filename works on Windows.

### Time taken notification

Shows a notification after the full agent run settles and the prompt returns to the user, including automatic retries, compaction retries, and queued continuations.

Examples:

```text
Took 42s
Took 1m5s
```
