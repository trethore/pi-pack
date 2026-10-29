# pi-openai-settings

Manage advanced OpenAI Responses settings through global config, environment variables, and commands.

- Model verbosity
- Reasoning summaries
- Provider-sided Web search tool
- Service tier

## Installation

Requires Pi `1.4.0` or a compatible later release.

From the repository root, install pi-openai-settings globally:

```sh
npm ci
npm run install:pi-openai-settings
```

## Configuration

Create a global `~/.pi/agent/pi-openai-settings.jsonc` config file. If `PI_CODING_AGENT_DIR` is set, the config file is
read from that directory instead.

All entries are optional. Without configuration or environment overrides, the extension makes no payload changes. Only
`/openai-settings enabled true|false` is available by default.

```jsonc
// The following schema excerpt describes the available options.
{
	"properties": {
		"enabled": {
			"type": "boolean",
			"description": "Whether the extension is enabled. When false, no features are applied and the payload is left untouched.",
			"default": true,
		},
		"verbosity": {
			"type": "object",
			"properties": {
				"value": {
					"type": ["string", "null"],
					"enum": ["low", "medium", "high", null],
					"description": "Model response verbosity. null leaves the payload untouched.",
					"default": null,
				},
				"command": {
					"type": "boolean",
					"description": "Whether /openai-settings verbosity is available.",
					"default": false,
				},
			},
		},
		"reasoningSummary": {
			"type": "object",
			"properties": {
				"value": {
					"type": ["string", "null"],
					"enum": ["concise", "auto", "detailed", "none", null],
					"description": "Reasoning summary style. none removes the summary request; null leaves the payload untouched.",
					"default": null,
				},
				"command": {
					"type": "boolean",
					"description": "Whether /openai-settings reasoningSummary is available.",
					"default": false,
				},
			},
		},
		"webSearch": {
			"type": "object",
			"properties": {
				"value": {
					"type": ["boolean", "null"],
					"description": "true enables web search; false removes web-search tools; null leaves the payload untouched.",
					"default": null,
				},
				"command": {
					"type": "boolean",
					"description": "Whether /openai-settings webSearch is available.",
					"default": false,
				},
			},
		},
		"serviceTier": {
			"type": "object",
			"properties": {
				"value": {
					"type": ["string", "null"],
					"enum": ["default", "priority", "ultrafast", null],
					"description": "Service tier to request. null leaves the payload untouched.",
					"default": null,
				},
				"command": {
					"type": "boolean",
					"description": "Whether /openai-settings serviceTier is available.",
					"default": false,
				},
			},
		},
	},
}
```

See [pi-openai-settings.example.jsonc](pi-openai-settings.example.jsonc) for an example configuration with every feature
and command enabled.

Run `/reload` or restart Pi after editing the config file. Changes made through `/openai-settings` do not require a
reload.

### Settings

| Feature            | Values                                        | Behavior                                                                                  |
| ------------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `verbosity`        | `low`, `medium`, `high`, `null`               | Sets `text.verbosity`, preserving other text options.                                     |
| `reasoningSummary` | `concise`, `auto`, `detailed`, `none`, `null` | Sets `reasoning.summary`. `none` removes the field without changing the reasoning effort. |
| `webSearch`        | `true`, `false`, `null`                       | `true` adds a web-search tool; `false` removes web-search tools.                          |
| `serviceTier`      | `default`, `priority`, `ultrafast`, `null`    | Sets `service_tier`.                                                                      |

For every feature, `null` means **leave the payload untouched**, not remove the setting. Pi or another extension may
already have supplied a value.

`reasoningSummary: { "value": "none" }` removes the summary request; the string `"none"` is never sent to the API. It
does not disable reasoning itself.

Enabling web search adds `{ "type": "web_search" }` unless a `web_search` or `web_search_preview` tool is already
present. Disabling it removes all tools of those two types. Other tools are preserved.

## Commands

Enable a feature's `command` flag to change it from Pi:

```text
/openai-settings verbosity low
/openai-settings reasoningSummary none
/openai-settings webSearch true
/openai-settings serviceTier priority
/openai-settings verbosity null
/openai-settings enabled false
```

Run `/openai-settings` without arguments to see the available settings and values.

- `/openai-settings enabled true|false` is always available, even when the master switch is off.
- Each feature's `command` setting controls only that feature's subcommand.
- Changing a feature's value does not enable the extension when `enabled` is `false`.

Changes take effect on subsequent requests and are saved to the config. If saving fails, the current setting remains
unchanged.

## Environment variables

Settings are resolved in this order, from highest to lowest priority:

1. Commands.
2. Environment variables.
3. Global config, unless `PI_OPENAI_CONFIG=false`.
4. Built-in defaults.

| Variable                      | Values                                        | Purpose                                                |
| ----------------------------- | --------------------------------------------- | ------------------------------------------------------ |
| `PI_OPENAI_CONFIG`            | `true`, `false`                               | Whether to read the global config. Defaults to `true`. |
| `PI_OPENAI_ENABLED`           | `true`, `false`                               | Overrides the master switch.                           |
| `PI_OPENAI_VERBOSITY`         | `low`, `medium`, `high`, `null`               | Overrides verbosity.                                   |
| `PI_OPENAI_REASONING_SUMMARY` | `concise`, `auto`, `detailed`, `none`, `null` | Overrides reasoning summaries.                         |
| `PI_OPENAI_WEB_SEARCH`        | `true`, `false`, `null`                       | Overrides web search.                                  |
| `PI_OPENAI_SERVICE_TIER`      | `default`, `priority`, `ultrafast`, `null`    | Overrides service tier.                                |

Use lowercase values exactly as listed. Environment variables are read when the extension loads; feature overrides do
not change command flags.

To apply only low verbosity without inheriting any saved settings:

```sh
PI_OPENAI_CONFIG=false PI_OPENAI_VERBOSITY=low pi
```

This skips the entire config, including its master switch and command flags. The built-in master switch is `true`, all
other feature values are `null`, and only `/openai-settings enabled true|false` is available.

To inherit your config but override verbosity and web search:

```sh
PI_OPENAI_VERBOSITY=low PI_OPENAI_WEB_SEARCH=true pi
```

If the config's master switch is off, also set `PI_OPENAI_ENABLED=true`. Conversely,
`PI_OPENAI_ENABLED=false PI_OPENAI_VERBOSITY=low pi` makes no payload changes. Use `/openai-settings enabled true` to
turn the master switch back on.

## Supported providers

Only these provider/API combinations are modified:

| Provider       | Provider ID      | API                      |
| -------------- | ---------------- | ------------------------ |
| OpenAI         | `openai`         | `openai-responses`       |
| Azure OpenAI   | `azure`          | `azure-openai-responses` |
| GitHub Copilot | `github-copilot` | `openai-responses`       |

Other combinations, including Chat Completions and `openai-codex-responses`, are left untouched.

The extension edits the outgoing request payload. Availability of individual settings depends on the model, endpoint,
and account. It does not detect those capabilities or guarantee that a provider accepts every listed value.

## Behavior

The extension applies settings immediately before each provider request. It preserves unrelated payload fields and
leaves the entire payload untouched if the structure of `text`, `reasoning`, or tool declarations is invalid.

Unknown config keys, invalid config or environment values, malformed JSONC, and unreadable config files are errors. If
settings cannot be loaded, the extension reports an error through Pi's notification UI and remains inactive until a
successful reload. A missing config file uses the defaults.

## License

Licensed under the [MIT License](../../LICENSE) by Titouan Réthoré.
