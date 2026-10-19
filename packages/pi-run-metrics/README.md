# pi-run-metrics

Display run metrics like token usage, speed, duration, and estimated cost through a widget or notifications.

## Installation

Requires Pi `1.3.0` or a compatible later release.

From the repository root, install pi-run-metrics globally:

```sh
npm ci
npm run install:global:pi-run-metrics
```

## Configuration

No configuration is required, but you can customize the extension using a project-level `.pi/pi-run-metrics.jsonc` or a
global `~/.pi/agent/pi-run-metrics.jsonc` file:

```jsonc
// The following schema excerpt describes the available options.
{
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether the extension is enabled.",
      "default": true,
    },
    "mode": {
      "type": "string",
      "description": "Display mode.",
      "enum": ["widget", "notify"],
      "default": "widget",
    },
    "widgetColor": {
      "type": "string",
      "description": "Color of the widget text. Accepts any Pi theme color token or a six-digit RGB hex color such as #aabbcc.",
      "default": "accent",
    },
    "format": {
      "type": "string",
      "description": "Format of the displayed text.",
      "default": "<timetaken> | <tokps> | \u2191 <input_tokens> \u2193 <output_tokens> | <cost>",
    },
  },
}
```

See [pi-run-metrics.example.jsonc](pi-run-metrics.example.jsonc) for an example configuration.

The project configuration replaces the global configuration completely. The global path follows Pi's agent directory if
you customize it with `$PI_CODING_AGENT_DIR`.

Unknown configuration keys are ignored and reported as warnings. Invalid configuration causes an error rather than
falling back to another configuration or the defaults.

Run `/reload` after changing the configuration.

### Format placeholders

| Placeholder       | Description                                                      | Example      |
| ----------------- | ---------------------------------------------------------------- | ------------ |
| `<timetaken>`     | Elapsed run duration, including tool execution.                  | `12s`        |
| `<tokps>`         | Output tokens per second of model request time, excluding tools. | `42.5 tok/s` |
| `<input_tokens>`  | Sum of reported input tokens.                                    | `1200`       |
| `<output_tokens>` | Sum of reported output tokens.                                   | `340`        |
| `<cost>`          | Estimated cost in USD, as reported by Pi.                        | `$0.0042`    |

Combine placeholders with any text or omit metrics you do not need. Unavailable values display as `N/A`.

## Behavior

When a UI is available, pi-run-metrics displays metrics for one agent run, including all model requests and tool calls.
Metrics reset when the next run starts.

- **Widget:** shows a right-aligned widget above the editor. Duration refreshes every second while the agent is running,
  including during streaming and tool execution. Token usage, speed, and cost update after completed assistant messages.
  The final summary stays visible until the next run.
- **Notify:** sends a summary notification when the agent finishes.

Speed includes model request latency but excludes tool execution time. Token counts use Pi's reported input and output
fields; cache reads and writes are not added to those counts.

## License

Licensed under the [MIT License](../../LICENSE).
