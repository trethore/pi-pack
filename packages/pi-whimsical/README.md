# pi-whimsical

Replace Pi's working message with a random whimsical message on each turn.

## Installation

Requires Pi `1.5.2` or a compatible later release.

From the repository root, install pi-whimsical globally:

```bash
npm ci
npm run install:pi-whimsical
```

## Configuration

No configuration is required, but you can customize the messages via a global `~/.pi/agent/pi-whimsical.jsonc`.

```jsonc
// The following schema excerpt describes the available options.
{
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether the extension is enabled.",
      "default": true
    },
    "messages": {
      "type": "array",
      "description": "Custom messages. If omitted or empty, the built-in list is used.",
      "items": {
        "type": "string"
      }
    }
  }
}
```

See [pi-whimsical.example.jsonc](./pi-whimsical.example.jsonc) for an example configuration.

Run `/reload` or restart Pi after changing the configuration to enable the changes.

## License

Licensed under the [MIT License](LICENSE) by Titouan Réthoré.
