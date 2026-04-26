# pi-cut

Cost-cutting strategies for pi.

## Configuration

`pi-cut` reads JSONC config from:

1. `~/.pi/agent/pi-cut.jsonc`
2. `.pi/pi-cut.jsonc`

Project config overrides global config. See [`pi-cut.example.jsonc`](./pi-cut.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "terminalCleanup": {
    "enabled": true,
    "stripAnsi": true,
    "collapseCarriageReturns": true,
  },
  "duplicateLineFolding": {
    "enabled": true,
    "minRepeats": 3,
  },
  "lineTruncation": {
    "enabled": true,
    "maxChars": 2000,
  },
  "tools": [
    {
      "selector": "*",
      "lineTruncation": { "maxChars": 1000 },
    },
    {
      "selector": "read",
      "lineTruncation": { "maxChars": 4000 },
    },
  ],
}
```

Tool override rules:

- Top-level settings are the global defaults.
- Add optional per-tool overrides in `tools`.
- `selector` is a JavaScript regex string.
- Use `"*"` to match every tool.
- Default tool behavior is applied before `tools` rules:
  - `terminalCleanup` runs on `bash` only.
  - `duplicateLineFolding` does not run on `edit` or `write`.
  - `lineTruncation` does not run on `edit` or `write`.
- `tools` rules can override these defaults.
- Rules are applied from top to bottom.
- If multiple rules match, the last one wins.
- Project config loads after global config, so project rules win.

## Features

### Terminal cleanup

By default, bash tool results are cleaned by stripping ANSI escape sequences and collapsing carriage-return progress redraws to the visible final text. Other tools can opt in with `tools` overrides.

### Duplicate line folding

When enabled, consecutive identical non-empty text tool result lines are folded once they reach `minRepeats` total occurrences. `minRepeats` must be an integer greater than or equal to 2.

```text
Repeated line
[previous line repeated x2]
```

### Line truncation

When enabled, all text tool result lines longer than `maxChars` are truncated and annotated:

```text
first N chars [... truncated, +X chars]
```
