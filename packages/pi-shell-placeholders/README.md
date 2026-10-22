# pi-shell-placeholders

Expand shell placeholders with their output in system prompts and invoked prompt templates.

## Installation

Requires Pi `1.4.0` for full support. Prompt-template expansion uses version-checked runtime patches and is disabled
with a warning on other versions or incompatible runtimes. This compatibility check does not disable system-prompt
expansion.

From the repository root, install pi-shell-placeholders globally:

```sh
npm ci
npm run install:global:pi-shell-placeholders
```

## Quick start

Create `.pi/prompts/review.md` in a trusted project:

```text
Review these working-tree changes:

!`git diff --stat | head -n 10`
```

Run `/reload`, then invoke `/review`. The command's stdout replaces the placeholder in the user message sent to the
model and saved in history.

The same syntax works in Pi's `SYSTEM.md` and `APPEND_SYSTEM.md` sources, including `.pi/SYSTEM.md` and
`.pi/APPEND_SYSTEM.md`, and in their `--system-prompt` and `--append-system-prompt` overrides.

> [!WARNING]
>
> Commands run with Pi's permissions and inherited environment, not in a sandbox. Successful stdout becomes prompt
> content and is saved in session history. Only use trusted prompt sources and arguments, and avoid commands that print
> secrets. Template arguments are substituted into commands without shell escaping.

## Configuration

No configuration is required, but you can customize the extension using a project-level
`.pi/pi-shell-placeholders.jsonc` in a trusted project or a global `~/.pi/agent/pi-shell-placeholders.jsonc` file:

```jsonc
// The following schema excerpt describes the available options.
{
  "properties": {
    "enabled": {
      "type": "boolean",
      "description": "Whether the extension is enabled.",
      "default": true,
    },
    "surfaces": {
      "type": "object",
      "description": "Prompt surfaces to evaluate.",
      "properties": {
        "system": {
          "type": "boolean",
          "description": "Evaluate the effective custom system prompt, including SYSTEM.md and CLI overrides.",
          "default": true,
        },
        "appendSystem": {
          "type": "boolean",
          "description": "Evaluate the effective appended system prompt, including APPEND_SYSTEM.md and CLI overrides.",
          "default": true,
        },
        "promptTemplates": {
          "type": "boolean",
          "description": "Evaluate invoked prompt templates after Pi substitutes their arguments.",
          "default": true,
        },
      },
    },
    "execution": {
      "type": "object",
      "description": "Command execution settings. Limits apply per placeholder.",
      "properties": {
        "shell": {
          "type": "string",
          "description": "Absolute path to a shell that accepts -c, such as /bin/sh or /bin/bash.",
          "default": "/bin/sh",
        },
        "timeoutMs": {
          "type": "integer",
          "description": "Execution timeout per placeholder, in milliseconds.",
          "minimum": 1,
          "maximum": 2147483647,
          "default": 3000,
        },
        "maxOutputChars": {
          "type": "integer",
          "description": "Limit on stdout per placeholder, counted in Unicode code points. Overflow is treated as failure.",
          "minimum": 1,
          "maximum": 9007199254740991,
          "default": 1000,
        },
      },
    },
  },
}
```

See [pi-shell-placeholders.example.jsonc](pi-shell-placeholders.example.jsonc) for an example configuration.

The project configuration replaces the global configuration completely. Untrusted project configuration is ignored. The
global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Unknown configuration keys are ignored and reported as warnings. Invalid configuration causes an error rather than
falling back to another configuration or the defaults.

Run `/reload` after changing configuration or prompt files.

## Behavior

### System prompts

System placeholders are evaluated lazily, then their resolved text is persisted and reused:

| Action                                     | Behavior                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| New session                                | Evaluate on the first request, then freeze the result.                     |
| `/reload`                                  | Reset evaluation state; reevaluate on the next request, not during reload. |
| Resume or restart                          | Restore saved results without executing commands again.                    |
| Fork or tree navigation                    | Inherit the saved evaluation state from the selected history.              |
| Tool continuations, retries, or compaction | Keep the saved results without refreshing them.                            |

Changes to command output, files, or environment variables do not refresh a frozen system prompt. Use `/reload` to
refresh it. Failed placeholders are frozen too: they are not retried or warned about on every request.

Reusing saved text avoids placeholder-driven prompt changes between resets. Reload explicitly permits a refresh and may
invalidate the provider's cache. Earlier history is not rewritten, and provider cache hits are not guaranteed.

### Prompt templates

Each invocation evaluates its placeholders after Pi's native argument substitution. Substitution is literal, without
shell escaping, so arguments can alter shell behavior even inside a command authored with quotes.

Queued steering and follow-up invocations are evaluated before queueing. Delivery, retries, and history restoration
reuse the resolved message rather than executing it again.

Ordinary chat, skill content, tool output, and existing history are not scanned for placeholders.

### Commands and limits

- Within each surface or invocation, placeholders execute sequentially in textual order, using Pi's current working
  directory.
- Multiline commands are supported. Use `$()` for shell command substitution inside the backtick delimiters.
- Escape the opening marker as `` \!`command` `` to leave it literal. Unclosed placeholders are left unchanged.
- Successful commands substitute stdout exactly, including trailing newlines. Stderr is discarded.
- Expansion is single-pass: placeholder syntax or template variables produced by stdout are not interpreted again.
- A nonzero exit, shell startup failure, timeout, or output overflow preserves the placeholder and reports a warning.
  Partial output is discarded; no failure marker or instruction is inserted into the prompt.
- Timeout and output limits apply separately to each placeholder. Exceeding either limit terminates execution.

Output is never silently truncated. For commands that may produce lengthy output, bound it yourself with tools such as
`head` or `tail`, or increase `execution.maxOutputChars`. For example:

```text
!`git diff | head -c 1000`
```

## License

Licensed under the [MIT License](../../LICENSE).
