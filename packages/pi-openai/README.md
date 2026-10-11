# pi-openai

Configure OpenAI-compatible request parameters: verbosity, reasoning summaries, native web search, and service tiers.

**Default settings leave requests unchanged.** Feature support depends on the selected model, provider, and API.

## Installation

Requires Pi `1.1.0` or a compatible later release. From the repository root:

```sh
npm ci
npm run install:global:pi-openai
```

## Quick start

Try lower verbosity for the selected model, then inspect the result:

```text
/pi-openai verbosity low --scope model
/pi-openai
```

Command overrides apply to subsequent requests without reloading, subject to precedence and compatibility checks.
Changes are temporary until saved:

```text
/pi-openai save
```

To discard the model-scoped override and its pending edit instead:

```text
/pi-openai undo verbosity --scope model
```

Undo does not reverse saved writes. Save changes you want to keep before `/reload` or starting a new session.
See the [command lifecycle](docs/commands.md#what-changes-when) for details.

## Configuration

No file is required. To configure defaults, create `.pi/pi-openai.jsonc` in a trusted project or `~/.pi/agent/pi-openai.jsonc` globally:

```jsonc
{
  "verbosity": "low",
  "reasoningSummary": "auto",
}
```

Settings merge per key: commands > environment > project > global > defaults.
The global path follows `$PI_CODING_AGENT_DIR` when customized. Run `/reload` after editing files.

See the [configuration reference](docs/configuration.md) and [example configuration](pi-openai.example.jsonc) for scoped overrides.

## Documentation

- [Configuration](docs/configuration.md): settings, selectors, precedence, environment variables, and validation.
- [Commands](docs/commands.md): scopes, status, pending edits, undo, unset, and saving.
- [Compatibility](docs/compatibility.md): supported models and providers, Azure deployments, and payload safeguards.
- [Troubleshooting](docs/troubleshooting.md): ineffective commands, masked settings, and configuration errors.

## License

Licensed under the [MIT License](../../LICENSE).
