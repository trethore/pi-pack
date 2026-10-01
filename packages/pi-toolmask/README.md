# pi-toolmask

Hide and block Pi tools using ordered wildcard rules. Control top-level tools and tools available inside codemode separately.

## Installation

Requires Pi `1.0.0` or a compatible later release.

From the repository root, install pi-toolmask globally:

```sh
npm run install:global:pi-toolmask
```

## Configuration

Create one of these files:

| Scope   | Path                            |
| ------- | ------------------------------- |
| Global  | `~/.pi/agent/pi-toolmask.jsonc` |
| Project | `.pi/pi-toolmask.jsonc`         |

The project configuration replaces the global configuration completely.
The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Configuration loads at session start or after running `/reload`.
With neither file present, pi-toolmask leaves tools unchanged. Invalid configurations report an error instead of
falling back to the global file.

## Tool scopes and examples

Top-level tools and tools called inside codemode have separate names for matching:

| Mask            | Effect                                                |
| --------------- | ----------------------------------------------------- |
| `read`          | Disable top-level `read`, not nested `codemode.read`. |
| `codemode.read` | Disable nested `read`, not top-level `read`.          |
| `codemode.*`    | Disable every nested codemode tool.                   |
| `codemode`      | Disable the top-level codemode tool itself.           |

A normal rule masks matching tools. A leading `!` removes that mask. Rules run in order, and the last matching rule wins.
Exceptions only preserve tools already available in Pi; they do not enable inactive tools or bypass Pi's tool configuration.

### Allow only top-level read

```jsonc
{
  "masks": ["*", "!read"],
}
```

`*` masks every tool in both scopes, then `!read` preserves top-level `read`. Codemode remains disabled.

### Allow only codemode with nested read

```jsonc
{
  "masks": ["*", "!codemode", "!codemode.read"],
}
```

Both exceptions are required: `!codemode` allows the outer tool, and `!codemode.read` allows `read` inside it.
Using only `["*", "!codemode.read"]` leaves codemode disabled, so the model cannot reach nested `read`.
Pi must already make codemode and its nested `read` tool available.

Masked nested tools are removed from codemode's description, `ALL_TOOLS`, `searchTools()`, and `describeTool()`.
A script that guesses a masked tool's name fails without executing the underlying tool.

## Rule syntax and precedence

| Pattern | Matches or effect                  |
| ------- | ---------------------------------- |
| `read`  | Exactly `read`.                    |
| `*`     | Every tool name in both scopes.    |
| `read?` | `read` plus exactly one character. |
| `!read` | Remove the mask on `read`.         |

`*` matches zero or more characters. `?` matches exactly one character. Both can match the dot in a nested tool name,
so `*read` matches both `read` and `codemode.read`. Matching is case-sensitive; other characters are literal.

The last matching rule wins. For example, `["*", "!read", "read"]` disables `read` because the final rule overrides
the exception. Tools with no matching rule are not masked.

## Options and lifecycle

| Option                    | Default  | Behavior                                                             |
| ------------------------- | -------- | -------------------------------------------------------------------- |
| `enabled`                 | `true`   | Apply the configured masks. Set to `false` to leave tools unchanged. |
| `masks`                   | Required | Ordered array of mask strings. Use `[]` to mask nothing.             |
| `enforceBeforeAgentStart` | `false`  | Reapply the loaded masks before each agent run.                      |

Enable enforcement if another extension changes the active tools after session start:

```jsonc
{
  "enforceBeforeAgentStart": true,
  "masks": ["*", "!read"],
}
```

Enforcement reuses the loaded configuration. It does not read the file again before each run.
After editing the configuration, run `/reload` to apply it.

See [pi-toolmask.example.jsonc](pi-toolmask.example.jsonc) for an example configuration.

> [!NOTE]
> Codemode support wraps Pi's built-in codemode extension, retaining its sandbox, settings, and rendering.
> A tool hidden at the top level can remain internally active if it is still available through codemode.
> Top-level masked calls are still blocked.

## License

Licensed under the [MIT License](../../LICENSE).
