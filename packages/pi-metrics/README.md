# pi-metrics

Show per-turn token usage, speed, duration, and estimated cost in Pi.

## Installation

Requires Pi `1.0.4` or a compatible later release.

From the repository root, install pi-metrics globally:

```sh
npm ci
npm run install:global:pi-metrics
```

## Configuration

No configuration is required. To customize it, create `.pi/pi-metrics.jsonc` in your project or `~/.pi/agent/pi-metrics.jsonc` globally:

```jsonc
{
  "enabled": true,
  "mode": "notify",
  "format": "<timetaken> | <tokps> | \u2191 <input_tokens> \u2193 <output_tokens> | <cost>",
}
```

- `enabled`: defaults to `true`. Set to `false` to disable metrics.
- `mode`: defaults to `"notify"`. Use `"live"` to show metrics above the editor instead.
- `format`: controls the displayed text. The example above uses the default format.

Comments and trailing commas are supported. The project configuration replaces the global configuration completely.
The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Run `/reload` after changing the configuration. Invalid configuration reports an error rather than falling back.

### Format placeholders

| Placeholder       | Description                                                      | Example      |
| ----------------- | ---------------------------------------------------------------- | ------------ |
| `<timetaken>`     | Elapsed turn duration, including tool execution.                 | `12s`        |
| `<tokps>`         | Output tokens per second of model request time, excluding tools. | `42.5 tok/s` |
| `<input_tokens>`  | Sum of reported input tokens.                                    | `1200`       |
| `<output_tokens>` | Sum of reported output tokens.                                   | `340`        |
| `<cost>`          | Estimated cost in USD, as reported by Pi.                        | `$0.0042`    |

Combine placeholders with any text or omit metrics you do not need. Unavailable values display as `N/A`.

## Behavior

Metrics cover one agent run, including any model requests and tool calls, and reset when the next run starts.

- **Notify:** sends a summary notification when the agent finishes.
- **Live:** shows a right-aligned widget above the editor. It updates after assistant messages and tool executions, not continuously while streaming. The final summary stays visible until the next run.

Speed includes model request latency but excludes tool execution time. Token counts use Pi's reported input and output fields; cache reads and writes are not added to those counts.

The extension only displays metrics when a UI is available.

## License

Licensed under the [MIT License](../../LICENSE).
