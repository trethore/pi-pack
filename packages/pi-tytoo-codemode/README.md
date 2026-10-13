# pi-tytoo-codemode

Opinionated implementation of Pi's built-in codemode.

> [!NOTE]
> This worker-only Pi extension follows upstream codemode behavior, with my opinionated changes on top. It does not implement the standalone SDK's inline/remote backends or deterministic replay API.
> See the [upstream codemode README](https://github.com/earendil-works/pi/blob/v1.2.0/packages/codemode/README.md) for the sandbox API and behavior, and [local changes from upstream](upstream/CHANGES.md) for the differences maintained here.

## Installation

Requires Pi `1.2.0` or a compatible later release.

From the repository root, install pi-tytoo-codemode globally:

```sh
npm ci
npm run install:global:pi-tytoo-codemode
```

In Pi's settings (`~/.pi/agent/settings.json` globally or `.pi/settings.json` for your project), enable the replacement tool and disable the built-in extension:

```json
{
  "$schema": "https://pi.dev/schemas/settings.schema.json",
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

## Upstream tests

The imported worker, declaration, and source-parser tests are based on Pi `v1.2.0`.
From the repository root:

```sh
npm run import:pi -- v1.2.0
npm run upstream:import --workspace=pi-tytoo-codemode
npm run test:upstream --workspace=pi-tytoo-codemode
```

The importer records the upstream commit and file hashes in `upstream/baseline.json`.
`upstream/test-adaptations.json` restricts the shared sandbox suite to this extension's worker backend.
`upstream/exclusions.json` records the unsupported standalone SDK suites (`portable.test.ts` and `deterministic.test.ts`); their hashes and reasons are also recorded in the baseline. These are coverage gaps, not passing tests.
Local prompt and canonical-name expectations remain in `upstream/prompt-expectations.json`.

## License

Licensed under the [MIT License](../../LICENSE).
Upstream code retains its [MIT license notice](LICENSES/pi).
