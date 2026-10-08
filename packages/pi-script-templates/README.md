# pi-script-templates

Replace `{{name}}` placeholders in system prompts and prompt templates with cached script output.

## Installation

Requires Pi `1.1.0` or a compatible later release.

From the repository root, install pi-script-templates globally:

```sh
npm ci
npm run install:global:pi-script-templates
```

## Usage

Create `~/.pi/agent/script-templates/platform.mjs`:

```js
import { arch, platform } from "node:os";

console.log(`${platform()} (${arch()})`);
```

Add a placeholder to `~/.pi/agent/APPEND_SYSTEM.md`:

```markdown
The user's platform is {{platform}}.
```

Run `/reload`. On the next agent run, `{{platform}}` is replaced with the script's stdout, for example `linux (x64)`.
The script runs only when its placeholder is used. Its output is reused until `/reload`, not refreshed on every turn.

### Prompt templates

Create `~/.pi/agent/prompts/environment.md`:

```markdown
---
description: Answer with platform context
---

The user's platform is {{platform}}.

$@
```

After `/reload`, invoke it with:

```text
/environment How do I list running processes?
```

Prompt arguments support `$1`, `$2`, `$@`, `$ARGUMENTS`, defaults such as `${1:-default}`, and slices such as `${@:2:3}`.
You can use a script as a default, too:

```markdown
Explain how to install $1 on ${2:-{{platform}}}.
```

Here, `platform` runs only if the second argument is missing. Placeholders supplied in command arguments are left literal.
Script output is also literal: it is not expanded again as placeholders, prompt arguments, or slash commands.

### Supported locations

| Location                                       | Expanded content                          |
| ---------------------------------------------- | ----------------------------------------- |
| `SYSTEM.md` or `--system-prompt`               | Custom system prompt text.                |
| `APPEND_SYSTEM.md` or `--append-system-prompt` | Appended system prompt text.              |
| Prompt templates invoked as `/name`            | The template body, excluding frontmatter. |

Expansion happens in memory. Source files are not modified.
Ordinary messages, `AGENTS.md`, skills, and extension commands are not expanded.

## Scripts

Place scripts in either directory:

- `~/.pi/agent/script-templates/` for all workspaces.
- `.pi/script-templates/` for the current project, after project trust is granted.

Only direct `.js` and `.mjs` files are discovered. The filename without its extension becomes the placeholder name.
Names are case-sensitive and may contain letters, digits, underscores, and hyphens. Use `{{platform}}`, not `{{ platform }}`.
Paths and JavaScript expressions are not supported inside placeholders.

A project script takes precedence over a global script with the same name, with a warning.
If the selected scope contains both `name.js` and `name.mjs`, `{{name}}` is left unchanged with a warning rather than choosing one.

### Execution

Scripts run with Node.js in the active workspace directory, including global scripts. They inherit Pi's environment plus:

| Variable                   | Value                            |
| -------------------------- | -------------------------------- |
| `PI_WORKSPACE_CWD`         | Active workspace directory.      |
| `PI_SCRIPT_TEMPLATE_NAME`  | Placeholder name without braces. |
| `PI_SCRIPT_TEMPLATE_SCOPE` | `global` or `project`.           |

Write the replacement text to stdout and exit successfully. One final newline is removed; other whitespace is preserved.
Empty output removes the placeholder. Stdin is closed and stderr is discarded.

Scripts run with your user permissions, not in a sandbox. Only install scripts you trust.
Untrusted projects cannot supply scripts or extension configuration, but global scripts can still run in their workspace directory.

### Caching and failures

Each script runs at most once per workspace and trust state until `/reload`. The same result is shared across system prompts and prompt templates, including across new sessions in the same Pi process.

Missing scripts, ambiguous names, execution failures, timeouts, and oversized output leave the placeholder unchanged and produce a warning. Failed results are cached too; they are not retried on each turn.

Run `/reload` after changing scripts, prompt templates, or configuration, or whenever you want fresh script output.
Changes to files or environment variables do not automatically invalidate cached output.

## Configuration

No configuration is required. To customize it, create `.pi/pi-script-templates.jsonc` in your project or `~/.pi/agent/pi-script-templates.jsonc` globally:

```jsonc
{
  "enabled": true,
  "surfaces": {
    "system": true,
    "appendSystem": true,
    "promptTemplates": true,
  },
  "execution": {
    "timeoutMs": 3000,
    "maxOutputChars": 1000,
  },
}
```

The example above uses the default values.

- `enabled`: set to `false` to disable the extension.
- `surfaces`: enable or disable expansion separately for each supported location.
- `execution.timeoutMs`: maximum runtime per script, in milliseconds.
- `execution.maxOutputChars`: maximum stdout length, measured in JavaScript string units, not bytes. Oversized output is rejected, not truncated.

Both execution limits must be positive integers no greater than `2147483647`.
Comments and trailing commas are supported. A trusted project's configuration replaces the global configuration completely; omitted settings use defaults.
Global configuration and script paths follow Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Invalid or unreadable configuration disables the extension until `/reload`, with a warning rather than a fallback.
Unknown configuration keys produce warnings but do not disable the extension.

## License

Licensed under the [MIT License](../../LICENSE).
