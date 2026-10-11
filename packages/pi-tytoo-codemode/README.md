# pi-tytoo-codemode

Opinionated implementation of Pi's built-in codemode.

> [!NOTE]
> This extension follows upstream features and changes, with my opinionated changes on top.
> See the [upstream codemode README](https://github.com/earendil-works/pi/blob/main/packages/codemode/README.md) for the sandbox API and behavior, and [local changes from upstream](upstream/CHANGES.md) for the differences maintained here.

## Installation

Requires Pi `1.1.0` or a compatible later release.

From the repository root, install pi-tytoo-codemode globally:

```sh
npm ci
npm run install:global:pi-tytoo-codemode
```

In Pi's settings (`~/.pi/agent/settings.json` globally or `.pi/settings.json` for your project), enable the replacement tool and disable the built-in extension:

```json
{
  "defaultTools": ["+codemode"],
  "extensions": ["-builtin:codemode"]
}
```

Add these entries to your existing arrays rather than replacing other settings.
Restart Pi after installation and these settings changes.

## Configuration

No extension-specific configuration is required. To customize it, create `.pi/pi-tytoo-codemode.jsonc` in your project or `~/.pi/agent/pi-tytoo-codemode.jsonc` globally:

```jsonc
{
  "prettyResults": true,
}
```

See [pi-tytoo-codemode.example.jsonc](pi-tytoo-codemode.example.jsonc) for an example.

- `prettyResults`: defaults to `true`. Format user-facing JSON results as indented objects and lists with triple-quoted multiline strings.
  Set to `false` to keep raw JSON rendering. Model-facing output is unchanged.

A trusted project's configuration replaces the global configuration completely. Untrusted project configuration is ignored.
The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

Configuration loads on session start. Run `/reload` after changing it. Invalid configuration reports an error rather than falling back.

## License

Licensed under the [MIT License](../../LICENSE).
Upstream code retains its [MIT license notice](LICENSES/pi).
