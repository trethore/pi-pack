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
