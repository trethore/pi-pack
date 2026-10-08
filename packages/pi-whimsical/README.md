# pi-whimsical

Replace Pi's working message with a random whimsical message.

## Installation

Requires Pi `1.1.0` or a compatible later release.

From the repository root, install pi-whimsical globally:

```sh
npm ci
npm run install:global:pi-whimsical
```

## Configuration

No configuration is required. To customize it, create `.pi/pi-whimsical.jsonc` in your project or `~/.pi/agent/pi-whimsical.jsonc` globally:

```jsonc
{
  "enabled": true,
  "messages": ["Schlepping...", "Combobulating...", "Vibing..."],
}
```

- `enabled`: defaults to `true`. Set to `false` to leave Pi's working message unchanged.
- `messages`: an optional array of strings. A missing or empty array uses the built-in list.

The project configuration replaces the global configuration completely.
The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Run `/reload` after changing the configuration. Invalid configuration reports an error rather than falling back.

## Behavior

At the start of each turn, the extension picks a random message from your list or the 245 built-in messages.
Messages can repeat. The working message resets when the turn ends or the session shuts down.

The extension only changes the working message when a UI is available.

## License

Licensed under the [MIT License](../../LICENSE).
