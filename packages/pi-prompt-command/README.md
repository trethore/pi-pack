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

Supported surfaces:

- `system`: `.pi/SYSTEM.md` and `~/.pi/agent/SYSTEM.md`
- `appendSystem`: `.pi/APPEND_SYSTEM.md` and `~/.pi/agent/APPEND_SYSTEM.md`
- `promptTemplates`: expanded slash prompt templates
- `contextFiles`: `AGENTS.md` and `CLAUDE.md` context files
- `skills`: explicit `/skill:name` expansions

Default enabled surfaces are `system`, `appendSystem`, and `promptTemplates`. Context files and skills default to disabled.

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
