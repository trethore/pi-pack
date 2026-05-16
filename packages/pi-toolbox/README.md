# pi-toolbox

Various and useful tools for Pi.

## Configuration

`pi-toolbox` reads JSONC config from:

1. `~/.pi/agent/pi-toolbox.jsonc`
2. `.pi/pi-toolbox.jsonc`

Project config overrides global config. See [`pi-toolbox.example.jsonc`](./pi-toolbox.example.jsonc) for a copyable template.

```jsonc
{
  "enabled": true,
  "glob": {
    "enabled": true,
    "defaultLimit": 100,
  },
}
```

## Features

### Glob tool

Registers `glob`, a low-token file discovery tool powered by `rg --files -g`.

Arguments:

- `pattern`: glob pattern passed to `rg -g`
- `path`: directory to run in, defaults to cwd
- `limit`: maximum files to return, defaults to `glob.defaultLimit`, minimum `1`, maximum `1000`
- `noIgnore`: ignore `.gitignore` and `.ignore` with `--no-ignore`, defaults to `false`
- `hidden`: show hidden files with `--hidden`, defaults to `false`

Example output:

```text
base=. count=4
src/
  index.ts
  agent/
    glob.ts
    tools.ts
test/
  glob.test.ts
```

When the limit is reached, the header includes `limited=true`.
