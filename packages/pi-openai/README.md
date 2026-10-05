# pi-openai

Configure OpenAI-compatible request parameters with layered settings, environment variables, and runtime commands.

## Installation

Requires Pi `1.0.3` or a compatible later release.

From the repository root, install pi-openai globally:

```sh
npm run install:global:pi-openai
```

## Usage

Configure verbosity, reasoning summaries, native web search, and service-tier overrides for OpenAI-compatible requests. By default, the extension leaves requests unchanged.

Run `/pi-openai` to see a table for **All models**, a table for every configured or runtime scope, and a final **Effective settings** table for the selected model. Status marks matching scopes, the default command target, value sources, pending edits, and the save destination.

```text
/pi-openai verbosity medium
/pi-openai reasoningSummary auto
/pi-openai webSearch true
/pi-openai serviceTier priority
```

Commands edit the most specific existing scope matching the selected model. With only flat configuration, they affect **All models**, as before. Changes apply to subsequent requests without a reload and are temporary until saved:

```text
/pi-openai save
```

### Commands

| Command                                             | Description                                                                                                      |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `/pi-openai` or `/pi-openai status`                 | Show all scopes, effective settings, compatibility decisions, and save destination.                              |
| `/pi-openai <setting> <value>`                      | Override a setting at the automatic target scope for this session.                                               |
| `/pi-openai <setting> <value> --scope <scope>`      | Override a setting at an explicit scope, creating it if needed.                                                  |
| `/pi-openai reset [setting]`                        | Remove one or all command overrides at the automatic target scope.                                               |
| `/pi-openai reset [setting] --scope <scope>`        | Remove command overrides at an explicit scope.                                                                   |
| `/pi-openai reset --all-scopes`                     | Clear every runtime override and pending edit.                                                                   |
| `/pi-openai save`                                   | Save pending edits at their original scopes to the project file if it exists and is trusted, otherwise globally. |
| `/pi-openai save project`                           | Save pending edits to the project file, creating it if needed. Requires project trust.                           |
| `/pi-openai save global`                            | Save pending edits to the global file.                                                                           |
| `/pi-openai save [project\|global] --scope <scope>` | Retarget all pending edits to one scope in the saved file only.                                                  |

Scope names are `all`, `model`, `provider`, `api`, `provider+model`, `model+api`, `provider+api`, and `provider+model+api`. Identities come from the selected model and are captured when the command runs:

```text
/pi-openai verbosity low --scope provider+model
/pi-openai reasoningSummary auto --scope api
/pi-openai enabled false --scope all
```

Switching models does not move existing overrides. With no selected model, set/reset commands require `--scope all`; `reset --all-scopes` can still clear everything, and a bare save can persist previously captured edits.

Commands complete setting names, canonical values, and scope options. Reset affects runtime state only: it never edits files or restores built-in defaults when another loaded layer supplies a value. Empty runtime-only scopes disappear after reset.

### Automatic target selection

Commands select one existing matching scope, independently of whether it already defines the setting being changed:

1. Prefer more selector fields.
2. On equal field counts, prefer runtime overrides, then project configuration, then global configuration.
3. Within the same source level, prefer model over provider over API. For two fields: provider+model > model+api > provider+api.
4. If no scoped rule matches, target All models.

Every confirmation names the target. An explicit scope bypasses automatic selection. Runtime scopes remain candidates after saving; a scope created only by a retargeted save is not a candidate until reloaded.

Targeting is separate from effective-value resolution. All matching scopes contribute values, but a command edits only one scope. For example, a more specific global scope can be the command target while a broader project value would mask it after a global save and reload. A broader command edit can also be masked by a more specific runtime override; the confirmation reports this.

### Saving

Saving writes **only pending explicit edits**, across all edited scopes. It does not copy environment values, defaults, or inherited values. Existing comments, unrelated keys, and other scopes are preserved. With no pending edits, save does nothing.

An explicit save scope retargets the file write, not live overrides:

```text
/pi-openai verbosity low --scope model
/pi-openai save global --scope provider
```

The current session keeps the model-scoped override. The global file receives a provider-scoped setting for future sessions or reloads. Retargeting merges disjoint keys or identical values, but rejects conflicting values for the same key, including conflicts with runtime values already at the target. It does not delete previously saved source rules.

**Saving does not change the current session's loaded configuration or runtime settings.** Successful saves clear pending flags but keep runtime overrides active. Status shows saved values separately at their actual persisted scopes, marked for the next session/reload.

Reset after saving exposes the configuration loaded at session start, not the newly written file. Run `/reload` or start a new session to load saved settings and clear runtime overrides. Normal project/environment precedence still applies after reload; saving globally cannot bypass it.

## Configuration

No configuration is required. To customize it, create `.pi/pi-openai.jsonc` in your project or `~/.pi/agent/pi-openai.jsonc` globally:

```jsonc
{
  "verbosity": "medium",
  "overrides": [
    {
      "match": { "api": "openai-responses" },
      "settings": { "reasoningSummary": "auto" },
    },
    {
      "match": { "provider": "openai" },
      "settings": { "serviceTier": "priority" },
    },
    {
      "match": { "model": "gpt-6-sol" },
      "settings": { "verbosity": "low" },
    },
    {
      "match": { "provider": "openai", "model": "gpt-6-sol" },
      "settings": { "verbosity": "high" },
    },
  ],
}
```

Top-level settings apply to All models. Existing flat configuration remains valid. Every setting can also appear in an override's `settings` object.

A `match` selector must contain one or more of `provider`, `model`, and `api`. All supplied fields must match exactly. Model IDs are Pi's selected model IDs, not Azure deployment names. API means Pi's API identifier, such as `openai-responses`, not an endpoint or authentication method. There are no wildcards or automatic dated-model family matches.

Comments and trailing commas are supported. The global path follows Pi's agent directory if customized with `$PI_CODING_AGENT_DIR`. Untrusted project files are neither loaded nor considered for targeting, and cannot be saved.

| Setting            | Values                                                | Behavior                                                                                          |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `enabled`          | `true`, `false`                                       | Set to `false` to leave requests unchanged.                                                       |
| `allowUnsupported` | `true`, `false`                                       | Unsafe: bypass all support checks. Defaults to `false`.                                           |
| `verbosity`        | `"low"`, `"medium"`, `"high"`, `null`                 | Set response verbosity. `null` leaves the provider payload unchanged.                             |
| `reasoningSummary` | `"auto"`, `"concise"`, `"detailed"`, `"none"`, `null` | Set the reasoning summary mode. `"none"` removes `reasoning.summary`; `null` leaves it unchanged. |
| `webSearch`        | `true`, `false`                                       | Make native server-side web search available. `false` leaves existing tools unchanged.            |
| `serviceTier`      | `"priority"`, `"ultrafast"`, `"default"`              | Request priority or ultrafast processing. `"default"` leaves the provider payload unchanged.      |

Use unquoted values in commands, for example `/pi-openai verbosity null`.

`serviceTier: "priority"` sends `service_tier: "priority"`; `"ultrafast"` sends `service_tier: "ultrafast"`. Ultrafast is enabled only for `gpt-6-astra` (including dated IDs) on the recognized OpenAI endpoint, for both API-key and subscription authentication. Other models, Azure, and GitHub Copilot skip this override unless `allowUnsupported` is true.
The alias `"fast"` is accepted in configuration files, environment variables, and commands, and normalized to `"priority"` for status, saving, and requests. `"default"` does not force a standard tier or remove an existing service-tier override from the provider payload.

### Precedence

Settings merge per key, from highest to lowest layer priority:

```text
commands > environment > project configuration > global configuration > defaults
```

**Project settings always beat global settings**, even when a global selector is more specific. Environment variables remain unscoped and override both files.

Within a file or the command layer, all matching scopes contribute values in this order, strongest first:

```text
provider + model + API
provider + model
model + API
provider + API
model
provider
API
All models
```

Only explicitly supplied keys override lower-priority values. Declaration order does not affect precedence. Duplicate identical selectors in the same file are rejected, even if their fields appear in a different order.

For example, model-scoped verbosity can override provider-scoped verbosity while retaining provider-scoped service tier and API-scoped reasoning summary.

Omitted keys inherit. An explicit `null` cancels an inherited verbosity or reasoning-summary override; it does not remove a value already set by Pi's provider.

Run `/reload` after editing configuration files. Reloading or starting another session clears runtime overrides and loads saved files. Invalid configuration or environment values report an error rather than silently falling back, even in nonmatching scopes. Unknown settings produce warnings; unknown selector fields are rejected to prevent accidentally broadening a rule.

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

The intended scope is OpenAI models in Pi, including access through OpenAI, Azure, and GitHub Copilot. Other vendors and open-weight models are outside this support scope, even when they accept the OpenAI request format.

The extension supports Pi's `openai-responses` and `azure-openai-responses` API formats by default. For `openai-completions`, only verbosity is available.

By default, overrides require a recognized provider endpoint and a model in the extension's [built-in allowlist](src/request/compatibility.ts). The checks cover selected GPT-5.5 and newer model IDs (except GPT-5.5 Pro), not every newer or custom model.

### Provider feature handling

This table describes **what the extension does**, not a guarantee of server acceptance. It assumes a recognized endpoint, an allowlisted model, `allowUnsupported: false`, and an active setting. All features leave requests unchanged with their default settings.

| Provider                          | Pi API format            | `verbosity`               | `reasoningSummary`                           | `webSearch`          | `serviceTier: "priority"`                        |
| --------------------------------- | ------------------------ | ------------------------- | -------------------------------------------- | -------------------- | ------------------------------------------------ |
| OpenAI (`openai`)                 | `openai-responses`       | Set `text.verbosity`      | Set/remove `reasoning.summary`               | Add `web_search`     | Set `service_tier`                               |
| Azure (`azure`)                   | `azure-openai-responses` | Set `text.verbosity`      | Set/remove `reasoning.summary`               | Add `web_search`     | Set `service_tier` for listed Azure models below |
| GitHub Copilot (`github-copilot`) | `openai-responses`       | Set `text.verbosity`      | Set/remove `reasoning.summary` (best-effort) | Skip: unverified     | Skip: unverified                                 |
| Any recognized provider           | `openai-completions`     | Set top-level `verbosity` | Skip: Responses only                         | Skip: Responses only | Skip: Responses only                             |

OpenAI and Azure share the same Responses payload transformations. Reasoning summaries require a reasoning-capable model; `auto` and `detailed` set the summary, `none` removes it, and `concise` is skipped as unverified.
Existing native search tools are preserved rather than duplicated. Both `priority` and its `fast` alias send `service_tier: "priority"`.

#### Azure eligibility

[Azure's reasoning guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/reasoning) documents verbosity and reasoning summaries. The extension also allows:

- **Web search:** Azure's [dedicated Responses guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search) documents `web_search`. Subscription administrators can block it. It uses Bing grounding, whose data handling differs from Azure OpenAI's usual compliance and geographic boundaries.
- **Priority:** Within the extension's allowlist, [Azure documents priority](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/priority-processing) for `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, and `gpt-6-sol`. Dated IDs use the same model-family check. Other Azure models skip priority without blocking the other settings.

Priority also requires an eligible model version, region, and Global Standard or US Data Zone Standard deployment. Regional Standard and EU Data Zone Standard are not supported. Pi does not expose deployment eligibility or subscription web-search policy to this extension, so these are server-side requirements, not checks performed here. Priority requests can fall back to standard processing.

#### GitHub Copilot limits

The extension retains best-effort reasoning-summary overrides. Copilot's [Responses client](https://github.com/microsoft/vscode/blob/main/extensions/copilot/src/platform/endpoint/node/responsesApi.ts) sends model-dependent verbosity but currently omits summary requests. This is not a guarantee that summary overrides are accepted.

Native `web_search` injection and `service_tier` overrides remain unverified on the Copilot endpoint used by Pi, so the extension skips them by default. Product-level web-search availability does not establish support for this request shape. `allowUnsupported` can attempt both on Responses payloads.

Provider references checked on October 4, 2026.

### Subscription authentication and unsafe overrides

> [!NOTE]
> Pi's current OpenAI ChatGPT-subscription sign-in uses the same recognized `openai` provider and API endpoint as API-key authentication.
> Subscription capabilities and restrictions can differ from the public API documentation, so documented API behavior is not a complete subscription contract. The legacy `openai-codex` provider is not supported by the default checks; `allowUnsupported` can attempt compatible payloads without guaranteeing server acceptance.

Use `/pi-openai status` to see why a setting is skipped. To attempt an unverified combination:

```text
/pi-openai allowUnsupported true
```

Typical uses are a proxy serving OpenAI models or a newly released or experimental OpenAI model not yet in the allowlist. This flag does not establish support for other vendors' models.

This is an unsafe override: it bypasses API, provider, endpoint, model, and feature-support checks, including for unknown API identifiers, legacy APIs, and custom providers or proxies.
Request format is inferred from the payload rather than the API identifier: a string or array `input` selects Responses transformations; an array `messages` selects Chat Completions verbosity only.

Value validation, disabled settings, and payload safeguards still apply. Requests with both `input` and `messages`, neither compatible shape, or a model different from the expected model ID or configured Azure deployment name are left unchanged.
These identity safeguards also apply with the default compatibility checks. Incompatible nested fields are preserved.
Status reports that overrides will be attempted on compatible payloads because their format is not known until a request is made.

Request behavior describes intended overrides, not server acceptance. The server can reject unsupported combinations. Web search makes a tool available; it does not force the model to use it.

### Azure deployment names

For the `azure` provider and `azure-openai-responses` API, the extension uses Pi's process-environment deployment mapping to match requests:

```sh
AZURE_OPENAI_DEPLOYMENT_NAME_MAP="gpt-5.5=production-assistant" pi
```

In this example, a selected `gpt-5.5` model can receive the Responses overrides listed above when the outgoing request names `production-assistant`. Support checks still use `gpt-5.5`; the deployment name is not changed. Azure deployment eligibility and subscription policy still apply.
Without a mapping for the selected model, the request must contain its model ID. Unexpected deployment names are left unchanged, even with `allowUnsupported`.

Pi does not expose request-specific deployment options or scoped environment overrides to this extension. If those options select a different deployment from the one expected from the process environment, the request is left unchanged.
Status describes model-level compatibility, not whether a particular request will pass this identity check or meet Azure's deployment and subscription requirements.

## License

Licensed under the [MIT License](../../LICENSE).
