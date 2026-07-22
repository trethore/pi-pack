# pi-command-template

Command output templates for Pi prompt resources.

## Features

- Replaces `{{template}}` placeholders with configured command output.
- Supports system prompts, context files, prompt templates, and skills.
- Runs commands through a shell or directly as executable arguments.
- Caches command output for each extension load or reload.
- Limits execution time and inserted output size.

## Installation

Requires Pi `>=0.81.1 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-command-template
```

Or install for the current project:

```sh
pi install -l ./packages/pi-command-template
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-command-template
```

## Quick start

Create `.pi/pi-command-template.jsonc`:

```jsonc
{
  "enabled": true,
  "surfaces": {
    "contextFiles": true,
  },
  "templates": {
    "node-version": ["node", "--version"],
  },
}
```

Use the template in `AGENTS.md` or `CLAUDE.md`:

```md
Node.js version: {{node-version}}
```

When Pi loads the resource, the placeholder is replaced by the configured command output.

## Configuration

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-command-template.jsonc` (defaults to `~/.pi/agent/pi-command-template.jsonc`)
2. `<project>/.pi/pi-command-template.jsonc`

Project configuration overrides global configuration. See [`pi-command-template.example.jsonc`](./pi-command-template.example.jsonc) for a copyable configuration.

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
    "allowShell": true,
  },
  "templates": {
    "osname": ". /etc/os-release && printf '%s\\n' \"$PRETTY_NAME\"",
    "git-branch": "git branch --show-current",
    "node-version": ["node", "--version"],
  },
}
```

## Supported surfaces

- `SYSTEM.md`
- `APPEND_SYSTEM.md`
- `AGENTS.md` and `CLAUDE.md`
- Prompt templates
- Skill descriptions in the system prompt
- Explicit `/skill:name` invocation content

## Execution

Commands run once per extension load or reload and are cached by template name.

Output is `stdout + stderr`, with one trailing line ending removed. If output exceeds `execution.maxOutputChars`, it is truncated and a warning is reported.

Template command values select their execution mode:

- Arrays such as `["node", "--version"]` run directly as an executable and arguments.
- Non-empty strings such as `"git branch --show-current"` run through the shell.

String commands require `execution.allowShell: true`. Shell execution is disabled by default. It enables shell syntax such as pipes, redirects, variables, `&&`, and builtins.

The removed `execution.shell` setting is not supported. Use arrays for direct execution and `execution.allowShell` to permit string shell commands.

Failed commands are replaced with a marker such as `[pi-command-template error: {{node-version}}]`, and a diagnostic is reported.

## Security

Enabling a surface allows content from that surface to trigger any matching configured command. Commands use the configured working directory and can read or execute workspace-controlled files. Only enable this extension, its surfaces, and `execution.allowShell` for resources and workspaces you trust.

## Behavior and limitations

The compatibility layer patches Pi prototypes process-wide. It is designed for Pi's normal single-session CLI. Multiple SDK sessions in the same process are not isolated: the most recently registered transformer for this extension directory is used by every patched Pi instance.

This extension uses an unsafe compatibility layer so templates are rendered before resources enter model context. Resource-loader methods are public Pi APIs, but prototype patching is unsupported, and explicit skill invocation depends on the private `AgentSession._expandSkillCommand` method. If Pi changes those internals, the affected patch is disabled and a warning is reported instead of crashing Pi.

## License

[MIT](../../LICENSE)
