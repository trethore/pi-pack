# pi-toolmask

Mask Pi tools and nested codemode tools with ordered wildcard rules.

## Installation

Requires Pi `0.99.1` or a compatible later release.

From the repository root, install pi-toolmask globally:

```sh
npm run install:global:pi-toolmask
```

<details>
<summary>Install for this project only</summary>

From the repository root:

```sh
npm run install:local:pi-toolmask
```

This uses `pi install -l` to add the package to the current project's Pi settings instead of the global settings.

</details>

<details>
<summary>Run for development without installing</summary>

From the repository root:

```sh
npm run dev:pi-toolmask
```

Or use `npm run dev` to load the root package's extension entry.

From `packages/pi-toolmask`, use:

```sh
npm run dev
```

These scripts start Pi with the extension loaded for that run without adding it to your Pi settings.

</details>

## Features

- Match tool names with `*` and `?` wildcards.
- Preserve tools with `!` exceptions. The last matching rule wins.
- Configure global masks or replace them per project using JSONC.
- Mask top-level tools and nested codemode tools separately.
- Hide masked nested tools from codemode descriptions and discovery, and reject attempted calls.

<details>
<summary>Tool availability</summary>

Codemode support wraps Pi's built-in codemode extension, retaining its sandbox, settings, and rendering.

Masks filter tools that Pi makes available. An exception does not activate an inactive tool or bypass Pi's tool configuration.

A tool hidden at the top level can remain internally active if it is still available through codemode.

</details>

## Configuration

Create one of these files:

| Scope   | Path                            |
| ------- | ------------------------------- |
| Global  | `~/.pi/agent/pi-toolmask.jsonc` |
| Project | `.pi/pi-toolmask.jsonc`         |

The project configuration replaces the global configuration completely.
The global path follows Pi's agent directory if you customize it ($PI_CODING_AGENT_DIR).

To disable every tool except top-level `read`:

```jsonc
{
  "enabled": true,
  "masks": ["*", "!read"],
}
```

Configuration loads at session start or after running `/reload`.

See [pi-toolmask.example.jsonc](pi-toolmask.example.jsonc) for an example configuration with before-agent-start enforcement.

<details>
<summary>Options and lifecycle</summary>

| Option                    | Default  | Behavior                                                             |
| ------------------------- | -------- | -------------------------------------------------------------------- |
| `enabled`                 | `true`   | Apply the configured masks. Set to `false` to leave tools unchanged. |
| `masks`                   | Required | Ordered array of mask strings. Use `[]` to mask nothing.             |
| `enforceBeforeAgentStart` | `false`  | Reapply the loaded masks before each agent run.                      |

Enable enforcement if another extension changes the active tools after session start:

```jsonc
{
  "enabled": true,
  "enforceBeforeAgentStart": true,
  "masks": ["*", "!read"],
}
```

Enforcement reuses the loaded configuration. It does not read the file again before each run.

With neither configuration file present, pi-toolmask leaves tools unchanged. JSONC comments and trailing commas are
supported. Invalid configurations report an error instead of falling back to the global file.

</details>

<details>
<summary>Wildcard rules and precedence</summary>

| Pattern  | Matches or effect                                        |
| -------- | -------------------------------------------------------- |
| `read`   | Exactly `read`.                                          |
| `*read`  | Names ending with `read`, including `codemode.read`.     |
| `read*`  | Names starting with `read`.                              |
| `*read*` | Names containing `read`.                                 |
| `*`      | Every tool name in both scopes.                          |
| `?read`  | One character followed by `read`, such as `bread`.       |
| `read?`  | `read` followed by exactly one character.                |
| `!read`  | Preserve top-level `read` if Pi already makes it active. |

`*` matches zero or more characters. `?` matches exactly one character. Both can match the dot in a nested tool name.
Matching is case-sensitive; other characters are literal.

Rules run in array order. A matching normal rule disables the tool, and a matching `!` rule removes that mask.
The last matching rule wins. Tools with no matching rule are not masked.

For example, `["*", "!read", "read"]` disables `read` because the final rule overrides the exception.

</details>

<details>
<summary>Top-level and nested codemode masks</summary>

Use the tool name for the top-level scope and a `codemode.` prefix for the nested scope:

| Mask            | Effect                                                |
| --------------- | ----------------------------------------------------- |
| `read`          | Disable top-level `read`, not nested `codemode.read`. |
| `codemode.read` | Disable nested `read`, not top-level `read`.          |
| `codemode.*`    | Disable every nested codemode tool.                   |
| `codemode`      | Disable the top-level codemode tool itself.           |

To preserve codemode and only its nested `read` tool:

```jsonc
{
  "enabled": true,
  "masks": ["*", "!codemode", "!codemode.read"],
}
```

Pi must already make codemode and its nested `read` tool available. These exceptions do not activate them.

Masked nested tools are removed from codemode's description, `ALL_TOOLS`, `searchTools()`, and `describeTool()`.
A script that guesses a masked tool's name fails without executing the underlying tool.

</details>

## License

Licensed under the [MIT License](../../LICENSE).
