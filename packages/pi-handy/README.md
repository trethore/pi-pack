# pi-handy

Handy features.

## Configuration

`pi-handy` reads JSONC config from:

1. `~/.pi/agent/pi-handy.jsonc`
2. `.pi/pi-handy.jsonc`

Project config overrides global config. See [`pi-handy.example.jsonc`](./pi-handy.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "thinkingLevel": {
    "enabled": true,
  },
  "showSysprompt": {
    "enabled": true,
  },
  "dumpSessionHistory": {
    "enabled": true,
  },
  "timeTaken": {
    "enabled": true,
  },
}
```

## Features

### Thinking level command

Registers `/thinkinglevel <thinkingLevel>` to set the current model thinking level from the prompt.

Examples:

```text
/thinkinglevel medium
/thinkinglevel off
```

### Show system prompt command

Registers `/showsysprompt [prompt|tools]` to show the current system prompt and available tools in Pi.
Without arguments, it shows both. Use `prompt` or `tools` to show only that section.

Examples:

```text
/showsysprompt
/showsysprompt prompt
/showsysprompt tools
```

### Dump session history command

Registers `/dumphistory` to dump the current session history to `~/.pi/agent/.session-history-<ISO-DATE>`.

### Time taken notification

Shows a notification when the agent finishes and the prompt returns to the user.

Examples:

```text
Took 42s
Took 1m5s
```
