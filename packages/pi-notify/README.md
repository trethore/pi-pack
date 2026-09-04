# pi-notify

Send a terminal desktop notification when Pi finishes all automatic work and is ready for input.

## Installation

Requires Pi `>=0.85.0 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-notify
```

Or install for the current project:

```sh
pi install -l ./packages/pi-notify
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-notify
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-notify.jsonc` (defaults to `~/.pi/agent/pi-notify.jsonc`)
2. `<project>/.pi/pi-notify.jsonc`

Project configuration overrides global configuration when the project is trusted. See [`pi-notify.example.jsonc`](./pi-notify.example.jsonc) for a copyable configuration.

```jsonc
{
  "enabled": true,
  "message": "Ready for input",
  "cooldown": 90,
  "unfocusedOnly": false,
  "protocol": "auto",
}
```

`cooldown` is the minimum number of seconds between notifications. Set it to `0` to disable the cooldown.

`protocol` accepts `auto`, `osc777`, `osc99`, or `osc9`. Automatic detection selects OSC 99 for Kitty, OSC 9 for iTerm2 or terminals advertising OSC 9 notifications, and OSC 777 for other recognized or unknown terminals.

`unfocusedOnly` uses the OSC 99 `unfocused` display policy. When another protocol is selected, pi-notify shows a warning and sends notifications without focus filtering.

Notifications are emitted only in interactive TUI mode. The extension uses `agent_settled`, so retries, compaction retries, and queued continuations finish before a notification is sent.

## License

[MIT](../../LICENSE)
