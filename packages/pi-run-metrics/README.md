# pi-run-metrics

Display metrics about the current run in a right-aligned widget above Pi's prompt.

```text
12s | 34.2 tok/s | ↑ 1200 ↓ 410 | $0.0042
```

## Installation

Requires Pi `1.4.0` or a compatible later release.

From the repository root, install pi-run-metrics globally:

```sh
npm ci
npm run install:pi-run-metrics
```

## Configuration

No configuration is required. To customize the widget, create a global `~/.pi/agent/pi-run-metrics.jsonc` config file.
If `PI_CODING_AGENT_DIR` is set, the config file is read from that directory instead.

```jsonc
// The following schema excerpt describes the available options.
{
	"properties": {
		"enabled": {
			"type": "boolean",
			"description": "Whether the extension is enabled.",
			"default": true,
		},
		"widgetColor": {
			"type": "string",
			"description": "Color of the widget text. Accepts any Pi theme color token or a six-digit RGB hex color such as #aabbcc or #AABBCC.",
			"default": "accent",
		},
		"format": {
			"type": "string",
			"description": "Format of the displayed text.",
			"default": "<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>",
		},
	},
}
```

See [pi-run-metrics.example.jsonc](pi-run-metrics.example.jsonc) for an example configuration. You can reorder or omit
placeholders and add your own labels in `format`. Unknown placeholders are left unchanged.

Unknown keys, invalid values, malformed JSONC, and unreadable config files are errors. If the configuration cannot be
loaded, the extension reports an error when a UI is available and remains inactive until a successful reload. Missing
configuration still uses the defaults.

Run `/reload` or restart Pi after changing the configuration to enable the changes.

## Metrics

All metrics describe the current run, not the entire session.

| Placeholder       | Description                                                                                             | Example      |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ------------ |
| `<timetaken>`     | End-to-end elapsed time, including time to first token and tool execution.                              | `1m0s`       |
| `<tokps>`         | Estimated model output throughput, excluding tool execution and the wait for the first streaming delta. | `34.2 tok/s` |
| `<input_tokens>`  | Sum of reported non-cached input tokens across model responses.                                         | `1200`       |
| `<output_tokens>` | Sum of reported output tokens across model responses.                                                   | `410`        |
| `<cost>`          | Pi's estimated run cost in USD, including any reported cache costs, with four decimal places.           | `$0.0042`    |

Elapsed time is displayed in whole seconds. Leading zero units are omitted, but smaller units are retained: `0s`, `9s`,
`1m0s`, `2m7s`, `1h0m0s`.

Throughput uses the total reported output tokens divided by the total measured generation time across responses. Each
response is timed from its first nonempty text, thinking, or tool-call delta until completion. This is an observed
estimate: providers can batch tokens into chunks. Throughput shows `N/A` when timing data is unavailable.

Cost shows `N/A` when the model or its cost estimate is unavailable.

## Behavior

A run starts at `agent_start` and ends at `agent_settled`, including any tool calls and subsequent model responses.

While using Pi and when UI is available:

- The widget is visible before the first run, initially showing `0s | N/A | ↑ 0 ↓ 0 | $0.0000`.
- Starting a run resets all metrics.
- Elapsed time refreshes every second.
- Throughput, token counts, and cost refresh after tool execution ends, with a final refresh when the run settles.
- Completed values remain visible until the next run, including after cancellation.

Reloading or switching sessions resets the displayed values.

## License

Licensed under the [MIT License](../../LICENSE) by Titouan Réthoré.
