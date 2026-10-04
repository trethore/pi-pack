# pi-openai

Configure OpenAI-compatible request parameters with layered settings, environment variables, and runtime commands.

## Installation

Requires Pi `1.0.2` or a compatible later release.

From the repository root, install pi-openai globally:

```sh
npm run install:global:pi-openai
```

## Usage

Configure verbosity, reasoning summaries, native web search, and Fast mode for OpenAI-compatible requests. By default, the extension leaves requests unchanged.

Run `/pi-openai` to show each setting's effective value, source, and intended request behavior for the selected model.

```text
/pi-openai verbosity medium
/pi-openai reasoningSummary auto
/pi-openai webSearch true
/pi-openai serviceTier fast
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

Commands complete setting names and canonical values. Reset does not edit configuration files or restore built-in defaults when another layer supplies a value.

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
| `allowUnsupported` | `true`, `false`                                       | Unsafe: bypass all support checks. Defaults to `false`.                                           |
| `verbosity`        | `"low"`, `"medium"`, `"high"`, `null`                 | Set response verbosity. `null` leaves the provider payload unchanged.                             |
| `reasoningSummary` | `"auto"`, `"concise"`, `"detailed"`, `"none"`, `null` | Set the reasoning summary mode. `"none"` removes `reasoning.summary`; `null` leaves it unchanged. |
| `webSearch`        | `true`, `false`                                       | Make native server-side web search available. `false` leaves existing tools unchanged.            |
| `serviceTier`      | `"fast"`, `"default"`                                 | Request Fast mode. `"default"` leaves the provider payload unchanged.                             |

Use unquoted values in commands, for example `/pi-openai verbosity null`.

`serviceTier: "fast"` sends `service_tier: "fast"`. The legacy value `"priority"` is accepted in configuration files, environment variables, and commands, and normalized to `"fast"` for status, saving, and requests. `"default"` does not force a standard tier or remove an existing Fast mode override from the provider payload.

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

The extension supports Pi's `openai-responses` and `azure-openai-responses` API formats by default. For `openai-completions`, only verbosity is available.

By default, overrides require a recognized provider endpoint and a model in the extension's [built-in allowlist](src/request/compatibility.ts). The checks cover selected GPT-5.5 and newer model IDs (except GPT-5.5 Pro), not every newer or custom model.

- Verbosity and reasoning summaries are checked for OpenAI, GitHub Copilot, and Azure endpoints.
- Reasoning summaries require a reasoning-capable model. `concise` is skipped as unverified.
- Native web search and Fast mode are limited to recognized OpenAI endpoints.

> [!NOTE]
> Pi's current OpenAI ChatGPT-subscription sign-in uses the same recognized `openai` provider and API endpoint as API-key authentication.
> Subscription capabilities and restrictions can differ from the public API documentation, so documented API behavior is not a complete subscription contract. The legacy `openai-codex` provider is not supported by the default checks; `allowUnsupported` can attempt compatible payloads without guaranteeing server acceptance.

Use `/pi-openai status` to see why a setting is skipped. To attempt an unverified combination:

```text
/pi-openai allowUnsupported true
```

This is an unsafe override: it bypasses API, provider, endpoint, model, and feature-support checks, including for unknown API identifiers, legacy APIs, and custom providers or proxies.
Request format is inferred from the payload rather than the API identifier: a string or array `input` selects Responses transformations; an array `messages` selects Chat Completions verbosity only.

Value validation, disabled settings, and payload safeguards still apply. Requests with both `input` and `messages`, neither compatible shape, or a model different from the expected model ID or configured Azure deployment name are left unchanged.
These identity safeguards also apply with the default compatibility checks. Incompatible nested fields are preserved.
Status reports that overrides will be attempted on compatible payloads because their format is not known until a request is made.

Request behavior describes intended overrides, not server acceptance. The server can reject unsupported combinations. Web search makes a tool available; it does not force the model to use it.

### Azure deployment names

For the `azure-openai-responses` provider and API, the extension uses Pi's process-environment deployment mapping to match requests:

```sh
AZURE_OPENAI_DEPLOYMENT_NAME_MAP="gpt-5.5=production-assistant" pi
```

In this example, a selected `gpt-5.5` model can receive verbosity and reasoning-summary overrides when the outgoing request names `production-assistant`. Support checks still use `gpt-5.5`; the deployment name is not changed.
Without a mapping for the selected model, the request must contain its model ID. Unexpected deployment names are left unchanged, even with `allowUnsupported`.

Pi does not expose request-specific deployment options or scoped environment overrides to this extension. If those options select a different deployment from the one expected from the process environment, the request is left unchanged.
Status describes model-level compatibility, not whether a particular request will pass this identity check. Native web search and Fast mode remain excluded on Azure by the default support checks.

## License

Licensed under the [MIT License](../../LICENSE).
