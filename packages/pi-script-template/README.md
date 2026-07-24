# pi-script-template

Node.js script output templates for Pi prompt resources.

## Features

- Replaces `{{template-name}}` placeholders with script output.
- Supports system prompts, context files, prompt templates, and skills.
- Automatically discovers global and project script templates.
- Runs scripts directly with the active Node.js executable without a shell.
- Caches each script output for the extension load or reload.
- Limits execution time and inserted output size.

## Installation

Requires Pi `>=0.82.0 <1`.

```sh
pi install ./packages/pi-script-template
```

For the current project:

```sh
pi install -l ./packages/pi-script-template
```

For development:

```sh
pi -e ./packages/pi-script-template
```

## Quick start

Create `.pi/pi-script-template.jsonc`:

```jsonc
{
  "enabled": true,
  "surfaces": {
    "contextFiles": true,
  },
}
```

Create `.pi/script-templates/platform.mjs`:

```js
process.stdout.write(process.platform);
```

Use it in `AGENTS.md` or `CLAUDE.md`:

```md
Platform: {{platform}}
```

## Locations

Configuration is loaded from:

1. `$PI_CODING_AGENT_DIR/pi-script-template.jsonc`
2. `<project>/.pi/pi-script-template.jsonc`

Scripts are discovered from:

1. `$PI_CODING_AGENT_DIR/script-templates/`
2. `<project>/.pi/script-templates/`

Project configuration and scripts are loaded only for trusted projects. Project scripts override global scripts with the same template name.

Only top-level `.js`, `.mjs`, and `.cjs` files are discovered. The filename without its extension is the template name. Names may contain letters, digits, underscores, and hyphens.

## Configuration

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
  },
}
```

All rendering surfaces are disabled by default.

## Script execution

Scripts run through `process.execPath` with no shell. Their working directory is the directory containing the script.

The following environment variables are available:

- `PI_WORKSPACE_CWD`: active Pi workspace
- `PI_SCRIPT_TEMPLATE_NAME`: template name
- `PI_SCRIPT_TEMPLATE_SCOPE`: `global` or `project`

Standard output becomes the replacement value. One trailing line ending is removed. Standard error is reported as a warning and is not inserted into the prompt. A timeout, signal, or non-zero exit produces an error marker.

Example script that operates on the workspace:

```js
import { execFileSync } from 'node:child_process';

const branch = execFileSync('git', ['branch', '--show-current'], {
  cwd: process.env.PI_WORKSPACE_CWD,
  encoding: 'utf8',
});

process.stdout.write(branch.trim());
```

## Security

Script templates are arbitrary Node.js programs. Only install global scripts you trust, and only trust projects whose `.pi/script-templates` contents you intend to execute.

The extension uses the shared `pi-shared` compatibility layer to transform resources before they enter model context. That layer patches Pi prototypes process-wide because Pi does not currently expose equivalent resource transformation hooks.

## License

[MIT](../../LICENSE)
