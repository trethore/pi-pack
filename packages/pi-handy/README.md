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
  "showSysprompt": {
    "enabled": true,
  },
  "updatePi": {
    "enabled": true,
  },
  "applyPatch": {
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

### Show system prompt command

Registers `/showsysprompt [prompt|tools]` to show the current system prompt and available tools in Pi.
Without arguments, it shows both. Use `prompt` or `tools` to show only that section.

Examples:

```text
/showsysprompt
/showsysprompt prompt
/showsysprompt tools
```

### Update pi command

Registers `/updatepi` to check the latest published pi version. If an update is available, it quits Pi and starts `npm install -g @earendil-works/pi-coding-agent` in a detached process.

### Apply patch tool

Registers the `apply_patch` tool to create, update, or delete workspace files using structured patch operations.
