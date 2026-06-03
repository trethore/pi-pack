# pi-prompt-command

Inject command output in your prompt files via command placeholders.

## Configuration

`pi-prompt-command` reads JSONC config from:

1. `~/.pi/agent/pi-prompt-command.jsonc`
2. `.pi/pi-prompt-command.jsonc`

Project config overrides global config. See [`pi-prompt-command.example.jsonc`](./pi-prompt-command.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "surfaces": {
    "system": true,
    "appendSystem": true,
    "promptTemplates": true,
    "contextFiles": false,
    "skills": false,
  },
  "timeoutMs": 30000,
  "maxOutputBytes": 20000,
  "permissions": {
    "*": "deny",
    "git *": "allow",
    "git commit *": "deny",
    "git push *": "deny",
    "grep *": "allow",
    "npm test": "allow",
  },
}
```

## Features

### Command placeholders

Replaces command placeholders with captured stdout and stderr before the content reaches the model:

```md
Test status:

!`npm test`
```

Commands are parsed into an executable plus arguments and run without a shell. Shell control syntax such as `&&`, `;`, `|`, `<`, and `>` is rejected.

### Surfaces

| Surface           | Sources                                                | When commands run                                                | Default  |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------- | -------- |
| `system`          | `.pi/SYSTEM.md`, `~/.pi/agent/SYSTEM.md`               | First LLM turn of the session, then cached                       | Enabled  |
| `appendSystem`    | `.pi/APPEND_SYSTEM.md`, `~/.pi/agent/APPEND_SYSTEM.md` | First LLM turn of the session, then cached                       | Enabled  |
| `promptTemplates` | Expanded slash prompt templates                        | On `/command` invocation                                         | Enabled  |
| `contextFiles`    | `AGENTS.md`, `CLAUDE.md` context files                 | First LLM turn of the session, then cached                       | Disabled |
| `skills`          | `/skill:name` expansions and model-read skill files    | On `/skill:name` invocation or when the model reads a skill file | Disabled |

System prompt surfaces are lazy: commands do not run when Pi launches, only when the session first sends work to the model.

### Permissions

`permissions` is a pattern-to-decision map. Decisions are `"allow"` or `"deny"`.

Rules:

- Default behavior is deny.
- Matching uses the normalized command string, for example `git status`.
- `*` matches any text.
- Most specific match wins.
- If specificity ties, the later rule wins.

Example:

```jsonc
{
  "permissions": {
    "*": "deny",
    "git *": "allow",
    "git commit *": "deny",
    "git push *": "deny",
  },
}
```

Results:

```text
git status      -> allow
git commit -m x -> deny
git push        -> deny
npm test        -> deny
```
