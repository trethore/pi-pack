# pi-command-template

Inject command output in your prompt files via templates.

## Configuration

`pi-command-template` reads JSONC config from:

1. `~/.pi/agent/pi-command-template.jsonc`
2. `.pi/pi-command-template.jsonc`

Project config overrides global config. See [`pi-command-template.example.jsonc`](./pi-command-template.example.jsonc) for a copyable template.

All rendering surfaces and shell execution are disabled by default. Enable only the surfaces and execution mode you intend to use.

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

Failed commands are replaced with a short marker such as `[pi-command-template error: {{node-version}}]` and a diagnostic is reported.

## Security and process scope

Enabling a surface allows content from that surface to trigger any matching configured command. Commands use the configured working directory and can read or execute workspace-controlled files. Only enable this extension, its surfaces, and shell execution for resources and workspaces you trust.

The compatibility layer patches Pi prototypes process-wide. It is designed for Pi's normal single-session CLI. Multiple SDK sessions in the same process are not isolated: the most recently registered transformer for this extension directory is used by every patched Pi instance.

## Unsafe internals notice

This extension uses an unsafe compatibility layer that monkey-patches Pi internals so templates are rendered before resources enter model context. Resource-loader methods are public Pi APIs, but prototype patching is unsupported, and explicit skill invocation depends on the private `AgentSession._expandSkillCommand` method. If Pi changes those internals, the affected patch is disabled and a warning is reported instead of crashing Pi.
