# pi-whimsical

Replace Pi's default thinking and status text with a random whimsical phrase for each turn.

## Installation

Requires Pi `>=0.85.0 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-whimsical
```

Or install for the current project:

```sh
pi install -l ./packages/pi-whimsical
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-whimsical
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-whimsical.jsonc` (defaults to `~/.pi/agent/pi-whimsical.jsonc`)
2. `<project>/.pi/pi-whimsical.jsonc`

Project configuration overrides global configuration. See [`pi-whimsical.example.jsonc`](./pi-whimsical.example.jsonc) for a copyable configuration.

```jsonc
{
  "enabled": true,
  "messages": ["Consulting the sprites...", "Polishing the moonbeams..."],
}
```

`messages` must be a non-empty array of non-empty strings. Omit it or set it to `null` to use the built-in list. Setting it to `null` in project configuration also resets an inherited global custom list to the defaults.

Set `enabled` to `false` to keep Pi's default working message.

## Behavior

At the start of each turn, the extension selects one configured message at random and sets it as Pi's working message. At the end of the turn, it clears the override so the next turn starts cleanly.

## License

[MIT](../../LICENSE)
