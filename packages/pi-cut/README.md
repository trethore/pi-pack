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
  "lineTruncation": {
    "enabled": true,
    "maxChars": 2000,
  },
}
```

## Features

### Line truncation

When enabled, all text tool result lines longer than `maxChars` are truncated and annotated:

```text
first N chars... (truncated at N, X chars left...)
```
