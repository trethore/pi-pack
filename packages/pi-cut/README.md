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
}
```

## Features

### Terminal cleanup

When enabled, bash tool results are cleaned by stripping ANSI escape sequences and collapsing carriage-return progress redraws to the visible final text.

### Duplicate line folding

When enabled, consecutive identical non-empty text tool result lines are folded once they reach `minRepeats` total occurrences. `minRepeats` must be an integer greater than or equal to 2.

```text
Repeated line
[pi-cut: previous line repeated 2 more times]
```

### Line truncation

When enabled, all text tool result lines longer than `maxChars` are truncated and annotated:

```text
first N chars... (truncated at N, X chars left...)
```
