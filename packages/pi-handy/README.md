# pi-handy

Handy features for pi.

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