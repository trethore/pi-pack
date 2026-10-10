# pi-codemode-plus

Opinionated enhancements to Pi's built-in codemode.

## Installation

Requires Pi `1.1.0` or a compatible later release.

From the repository root, install pi-codemode-plus globally:

```sh
npm ci
npm run install:global:pi-codemode-plus
```

The extension does not activate codemode. If it is not already enabled, start Pi with `pi --tools +codemode`.

## Configuration

No configuration is required. To customize it, create `.pi/pi-codemode-plus.jsonc` in your project or `~/.pi/agent/pi-codemode-plus.jsonc` globally:

```jsonc
{
  "enabled": true,
  "prettyBash": true,
}
```

- `enabled`: defaults to `true`. Set to `false` to use Pi's original rendering.
- `prettyBash`: defaults to `true`. Render Bash-shaped JSON output as readable text followed by status metadata.

Trusted project configuration replaces the global configuration completely. Untrusted project configuration is ignored.
The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Run `/reload` after changing the configuration. Invalid configuration reports an error and disables formatting rather than falling back.

## Behavior

### Pretty Bash

Bash-shaped results printed by codemode appear as:

```text
==> text 2/2 <==
hello
world

Exit: 0 | Time: 0.1s | Truncated: no
```

Output separators are preserved. A full-output file path is shown when present.

Detection uses the JSON shape, not the originating tool: `output` must be a string, `truncated` a boolean, `exit_code` an integer, and `wall_time_seconds` a finite, nonnegative number. An optional `full_output_path` string is allowed. Property order does not matter.

Incomplete JSON, unexpected fields, and unrelated output are left unchanged. A matching object from another tool can also be formatted.

Only the user-facing renderer changes. Prompts, tool execution, stored results, and LLM-facing content remain unchanged.

## License

Licensed under the [MIT License](../../LICENSE).
