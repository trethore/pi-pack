# pi-openai

Configure OpenAI-compatible request parameters with layered settings, environment variables, and runtime commands.

## Installation

Requires Pi `1.0.2` or a compatible later release.

From the repository root, install pi-openai globally:

```sh
npm run install:global:pi-openai
```

## Usage

Configure verbosity, reasoning summaries, native web search, and priority processing for OpenAI-compatible requests. By default, the extension leaves requests unchanged.

Run `/pi-openai` to show each setting's effective value, source, and intended request behavior for the selected model.

```text
/pi-openai verbosity medium
/pi-openai reasoningSummary auto
/pi-openai webSearch true
/pi-openai serviceTier priority
```

Changes apply to subsequent requests without a reload. They are temporary until you save them:

```text
/pi-openai save
```

### Commands

| Command                             | Description                                                         |
| ----------------------------------- | ------------------------------------------------------------------- |
| `/pi-openai` or `/pi-openai status` | Show settings, compatibility decisions, and the save destination.   |
| `/pi-openai <setting> <value>`      | Override a setting for the current session.                         |
| `/pi-openai reset <setting>`        | Remove one command override and use the next configuration layer.   |
| `/pi-openai reset`                  | Remove all command overrides.                                       |
| `/pi-openai save`                   | Save to the project configuration if it exists, otherwise globally. |
| `/pi-openai save project`           | Save to the project configuration, creating it if needed.           |
| `/pi-openai save global`            | Save to the global configuration.                                   |

Commands complete setting names and accepted values. Reset does not edit configuration files or restore built-in defaults when another layer supplies a value.

Saving writes **all effective settings**, including environment and command overrides, not just the last change. Existing comments and unrelated keys are preserved. Saving globally does not remove higher-priority project, environment, or command overrides.

## Configuration

No configuration is required. To customize it, create `.pi/pi-openai.jsonc` in your project or `~/.pi/agent/pi-openai.jsonc` globally:

```jsonc
{
  "enabled": true,
  "allowUnsupported": false,
  "verbosity": null,
  "reasoningSummary": null,
  "webSearch": false,
  "serviceTier": "default",
}
```

The example above uses the default values. Comments and trailing commas are supported. The global path follows Pi's agent directory if you customize it with `$PI_CODING_AGENT_DIR`.

| Setting            | Values                                                | Behavior                                                                                          |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `enabled`          | `true`, `false`                                       | Set to `false` to leave requests unchanged.                                                       |
| `allowUnsupported` | `true`, `false`                                       | Bypass provider and model support checks. Defaults to `false`.                                    |
| `verbosity`        | `"low"`, `"medium"`, `"high"`, `null`                 | Set response verbosity. `null` leaves the provider payload unchanged.                             |
| `reasoningSummary` | `"auto"`, `"concise"`, `"detailed"`, `"none"`, `null` | Set the reasoning summary mode. `"none"` removes `reasoning.summary`; `null` leaves it unchanged. |
| `webSearch`        | `true`, `false`                                       | Make native server-side web search available. `false` leaves existing tools unchanged.            |
| `serviceTier`      | `"priority"`, `"default"`                             | Request priority processing. `"default"` leaves the provider payload unchanged.                   |

Use unquoted values in commands, for example `/pi-openai verbosity null`.

### Precedence

Settings merge per key, from highest to lowest priority:

```text
commands > environment > project configuration > global configuration > defaults
```

Omitted keys inherit from the next lower layer. An explicit `null` cancels an inherited verbosity or reasoning-summary override; it does not remove a value already set by Pi's provider.

Run `/reload` after editing configuration files. Reloading or starting another session clears unsaved command overrides. Invalid configuration or environment values report an error rather than silently falling back.

### Environment variables

| Variable                      | Setting            |
| ----------------------------- | ------------------ |
| `PI_OPENAI_ENABLED`           | `enabled`          |
| `PI_OPENAI_ALLOW_UNSUPPORTED` | `allowUnsupported` |
| `PI_OPENAI_VERBOSITY`         | `verbosity`        |
| `PI_OPENAI_REASONING_SUMMARY` | `reasoningSummary` |
| `PI_OPENAI_WEB_SEARCH`        | `webSearch`        |
| `PI_OPENAI_SERVICE_TIER`      | `serviceTier`      |

Values use the same spelling as command arguments:

```sh
PI_OPENAI_VERBOSITY=low PI_OPENAI_WEB_SEARCH=true pi
```

## Compatibility

The extension handles Pi's `openai-responses`, `azure-openai-responses`, and `openai-codex-responses` API formats. For `openai-completions`, only verbosity is available.

By default, overrides require a recognized provider endpoint and a model in the extension's [built-in allowlist](src/compatibility.ts). The checks cover selected GPT-5.5 and newer model IDs, not every newer or custom model.

- Verbosity and reasoning summaries are checked for OpenAI, Codex, GitHub Copilot, and Azure endpoints.
- Reasoning summaries require a reasoning-capable model. `concise` is skipped as unverified.
- Native web search and priority processing are limited to recognized OpenAI and Codex endpoints. Priority processing is skipped for `-pro` models.

Use `/pi-openai status` to see why a setting is skipped. To attempt an unverified combination:

```text
/pi-openai allowUnsupported true
```

This bypasses provider and model support checks, but not value validation or API-format checks. Requests whose model or payload format does not match the selected model are left unchanged.

Request behavior describes intended overrides, not server acceptance. The server can reject unsupported combinations. Web search makes a tool available; it does not force the model to use it.

## License

Licensed under the [MIT License](../../LICENSE).
