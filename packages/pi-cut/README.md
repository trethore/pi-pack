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
    "trimTrailingWhitespace": true,
  },
  "repetitionFolding": {
    "enabled": true,
    "minRepeats": 2,
    "minSavedLines": 3,
    "minSavedTokens": 40,
    "savingsMode": "or",
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
      "selector": "^read$",
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
- Use anchors for exact tool matches, such as `"^read$"`. An unanchored selector like `"read"` also matches names containing `read`.
- Default tool behavior is applied before `tools` rules:
  - `terminalCleanup` runs on `bash` only.
  - `repetitionFolding` does not run on `edit` or `write`.
  - `lineTruncation` does not run on `edit` or `write`.
- `tools` rules can override these defaults.
- Rules are applied from top to bottom.
- If multiple rules match, the last one wins.
- Global config loads first, then project config is merged on top.
- `tools` rules are appended rather than replaced, so project config inherits global tool rules by default.
- If global and project `tools` rules both match, the later project rule wins for the fields it sets.

## Features

### Terminal cleanup

By default, bash tool results are cleaned by stripping ANSI escape sequences, collapsing carriage-return progress redraws to the visible final text, and trimming trailing spaces and tabs from each line. Other tools can opt in with `tools` overrides.

### Repetition folding

When enabled, consecutive repeated non-empty text tool result segments are folded when they reach `minRepeats` total occurrences and save enough output. Single-line segments use the line marker; multi-line segments use the block marker.

Savings are checked by estimated tokens and/or lines:

- `minRepeats` must be an integer greater than or equal to 2.
- `minSavedLines` defaults to 3. Values less than or equal to 0 disable this check.
- `minSavedTokens` defaults to 40. Values less than or equal to 0 disable this check. Tokens are estimated as 1 token per 4 characters.
- `savingsMode` is `"or"` by default. Use `"and"` to require every enabled savings check to pass.
- Folding always requires positive estimated token savings.

Note: Folding is skipped for outputs above the hardcoded safety limit of 10,000 lines.

```text
line A
line B
line A
line B
line A
line B
```

becomes:

```text
line A
line B
[previous block of 2 lines repeated x2]
```

### Line truncation

When enabled, all text tool result lines longer than `maxChars` are truncated and annotated. `maxChars` must be an integer greater than or equal to 1:

```text
first N chars [... truncated, +X chars]
```
