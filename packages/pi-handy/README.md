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
  "switchWorkspace": {
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

### Switch workspace command

Registers `/switchworkspace <path>` to switch Pi to a different workspace directory.
The full argument is treated as the path, so spaces do not require quotes.

Examples:

```text
/switchworkspace C:\Users\titou\.pi\agent
/switchworkspace /Users/titou/my project
```
