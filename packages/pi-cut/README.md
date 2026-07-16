# pi-cut

Tool-output cost-cutting strategies.

## Features

- Cleans terminal formatting and progress redraws.
- Folds repeated text segments.
- Reduces large runs of consecutive newlines.
- Truncates individual long lines.
- Supports global defaults and per-tool overrides.

## Installation

Requires Pi `>=0.80.8 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-cut
```

Or install for the current project:

```sh
pi install -l ./packages/pi-cut
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-cut
```

## Quick start

Create `.pi/pi-cut.jsonc` to truncate long tool-result lines:

```jsonc
{
  "enabled": true,
  "lineTruncation": {
    "enabled": true,
    "maxChars": 2000,
  },
}
```

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-cut.jsonc` (defaults to `~/.pi/agent/pi-cut.jsonc`)
2. `<project>/.pi/pi-cut.jsonc`

Project configuration is merged over global configuration. See [`pi-cut.example.jsonc`](./pi-cut.example.jsonc) for a copyable configuration.

```jsonc
{
  "enabled": true,
  "transformErrors": false,
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
    "maxComparisons": 250000,
    "savingsMode": "or",
  },
  "newLinesFolding": {
    "enabled": true,
    "minNewLines": 10,
    "foldTo": 5,
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

### Tool overrides

- Top-level settings are the global defaults.
- Error results remain unchanged unless `transformErrors` is enabled globally or for a matching tool.
- Add optional per-tool overrides in `tools`.
- `selector` is a JavaScript regex string.
- Use `"*"` to match every tool.
- Use anchors for exact matches, such as `"^read$"`. An unanchored selector such as `"read"` also matches names containing `read`.
- Rules are applied from top to bottom. If multiple rules match, the last one wins.
- Global configuration loads first, then project configuration is merged over it.
- `tools` rules are appended rather than replaced, so project configuration inherits global tool rules.
- If global and project rules both match, the later project rule wins for the fields it sets.

Default behavior is applied before `tools` rules:

- `terminalCleanup` runs on `bash` only.
- `repetitionFolding` does not run on `edit` or `write`.
- `newLinesFolding` does not run on `edit` or `write`.
- `lineTruncation` does not run on `edit` or `write`.

Tool rules can override these defaults.

## Feature reference

### Terminal cleanup

By default, `bash` tool results are cleaned by stripping ANSI escape sequences, collapsing carriage-return progress redraws to the visible final text, and trimming trailing spaces and tabs from each line. Other tools can opt in through tool overrides.

### Repetition folding

Consecutive repeated non-empty text segments are folded when they reach `minRepeats` total occurrences and save enough output. Single-line segments use the line marker; multi-line segments use the block marker.

Savings are checked by estimated tokens and lines:

- `minRepeats` must be an integer greater than or equal to `2`.
- `minSavedLines` defaults to `3`. Values less than or equal to `0` disable this check.
- `minSavedTokens` defaults to `40`. Values less than or equal to `0` disable this check. Tokens are estimated as one token per four characters.
- `savingsMode` defaults to `"or"`. Use `"and"` to require every enabled savings check to pass.
- Folding always requires positive estimated token savings.
- Repetition searching stops after `maxComparisons` candidate and line comparisons and preserves the remaining output unchanged. The default is `250000`.

Folding is skipped for outputs above the hardcoded safety limit of 10,000 lines.

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

### Newline folding

Consecutive newline runs are folded when they contain at least `minNewLines` newlines. The run is replaced with exactly `foldTo` newlines. Both values must be integers greater than or equal to `2`, and `foldTo` must be less than or equal to `minNewLines`.

```text
before



after
```

With `minNewLines: 3` and `foldTo: 2`, this becomes:

```text
before


after
```

### Line truncation

Text tool-result lines longer than `maxChars` are truncated and annotated. `maxChars` must be an integer greater than or equal to `1`:

```text
first N chars [... truncated at N/TOTAL chars]
```

## License

[MIT](../../LICENSE)
