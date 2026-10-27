# pi-whimsical

## Installation

Requires Pi `1.4.0` or a compatible later release.

From the repository root, install pi-whimsical globally:

```sh
npm ci
npm run install:pi-whimsical
```

## Configuration

No configuration is required, but you can customize the messages via a global `~/.pi/agent/pi-whimsical.jsonc` config
file. If `PI_CODING_AGENT_DIR` is set, the config file is read from that directory instead.

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

Unknown keys, invalid values, malformed JSONC, and unreadable config files are errors. If the configuration cannot be
loaded, the extension reports an error when a UI is available and remains inactive until a successful reload. Missing
configuration still uses the defaults.

Run `/reload` or restart Pi after changing the configuration to enable the changes.

## Behavior

When a UI is available, the extension picks a random message from your list or the 295 built-in messages at the start of
each turn and sets it as the working message. Messages can repeat. The working message resets when the turn ends or the
session shuts down.

## License

Licensed under the [MIT License](../../LICENSE) by Titouan Réthoré.
