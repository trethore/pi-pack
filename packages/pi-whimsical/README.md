# pi-whimsical

Replace Pi's working message with a random whimsical message.

## Installation

Requires Pi `1.4.0` or a compatible later release.

From the repository root, install pi-whimsical globally:

```sh
npm ci
npm run install:global:pi-whimsical
```

## Configuration

No configuration is required, but you can customize the extension using a project-level `.pi/pi-whimsical.jsonc` or a
global `~/.pi/agent/pi-whimsical.jsonc` file:

```jsonc
// The following schema excerpt describes the available options.
{
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether the extension is enabled.",
      "default": true,
    },
    "messages": {
      "type": "array",
      "description": "Custom messages. If omitted or empty, the built-in list is used.",
      "items": {
        "type": "string",
      },
    },
  },
}
```

See [pi-whimsical.example.jsonc](pi-whimsical.example.jsonc) for an example configuration.

The project configuration replaces the global configuration completely. The global path follows Pi's agent directory if
you customize it with `$PI_CODING_AGENT_DIR`.

Unknown configuration keys are ignored and reported as warnings. Invalid configuration causes an error rather than
falling back.

Run `/reload` after changing the configuration.

## Behavior

When a UI is available, the extension picks a random message from your list or the 295 built-in messages at the start of
each turn and sets it as the working message. Messages can repeat. The working message resets when the turn ends or the
session shuts down.

## License

Licensed under the [MIT License](../../LICENSE).
