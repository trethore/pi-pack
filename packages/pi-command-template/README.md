# pi-command-template

Inject command output in your prompt files via templates.

## Configuration

`pi-command-template` reads JSONC config from:

1. `~/.pi/agent/pi-command-template.jsonc`
2. `.pi/pi-command-template.jsonc`

Project config overrides global config. See [`pi-command-template.example.jsonc`](./pi-command-template.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "surfaces": {
    "system": true,
    "appendSystem": true,
    "contextFiles": true,
    "promptTemplates": true,
    "skills": true,
  },
  "execution": {
    "timeoutMs": 3000,
    "maxOutputChars": 20000,
    "cwd": "workspace",
    "shell": true,
  },
  "templates": {
    "osname": ". /etc/os-release && printf '%s\\n' \"$PRETTY_NAME\"",
    "git-branch": "git branch --show-current",
    "node-version": ["node", "--version"],
  },
}
```

## Usage

Write placeholders in prompt resources:

```md
Operating system: {{osname}}
Current branch: {{git-branch}}
```

When Pi loads the resource, the placeholders are replaced by the configured command output.

## Supported surfaces

- `SYSTEM.md`
- `APPEND_SYSTEM.md`
- `AGENTS.md` / `CLAUDE.md`
- prompt templates
- skill descriptions in the system prompt
- explicit `/skill:name` invocation content

## Execution

Commands run once per extension load/reload and are cached by template name.

Output is `stdout + stderr`, with one trailing line ending removed. If output exceeds `execution.maxOutputChars`, it is truncated and a warning is reported.

`execution.shell` controls how commands run:

- `true`: run the command string through the shell. This supports pipes, redirects, `$VARIABLES`, `&&`, and shell builtins.
- `false`: parse the command string into a direct executable plus arguments. This avoids shell syntax and is useful for file-style commands such as `node --version`.

Template commands can also be arrays such as `["node", "--version"]`. Array commands always run directly as executable + arguments and are the preferred form when `shell` features are not needed.

## Unsafe internals notice

This extension uses an unsafe compatibility layer that monkey-patches Pi internals so templates are rendered before resources enter model context. If Pi changes those internals, the affected patch is disabled and a warning is reported instead of crashing Pi.
