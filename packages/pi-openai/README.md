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

Run `/pi-openai` to see tables for **All models**, configured or runtime scopes, and **Effective settings** for the selected model. Status marks matching scopes, the default command target, value sources, and the default destination for new sets. The **Temporary** table lists each pending edit with its recorded global or project source. Removals appear as **Removed** in red.

```text
/pi-openai verbosity medium
/pi-openai reasoningSummary auto
/pi-openai webSearch true
/pi-openai serviceTier priority
/pi-openai save
```

Value-setting commands edit the most specific existing scope matching the selected model. With only flat configuration, they affect **All models**. Command overrides apply to subsequent requests without a reload and are temporary until saved.

Each pending edit owns its **source file, scope, setting, and operation**. Saving commits these recorded edits; it never chooses a different destination or moves them to another scope.

### Commands

| Command                                                    | Description                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `/pi-openai` or `/pi-openai status`                        | Show scopes, effective settings, pending edits, and compatibility decisions.                               |
| `/pi-openai <setting> <value>`                             | Override a setting at the automatic target scope and record its default file destination.                  |
| `/pi-openai <setting> <value> --scope <scope>`             | Override a setting at an explicit scope, creating that scope if needed.                                    |
| `/pi-openai <setting> <value> --source global\|project`    | Choose the pending edit's destination explicitly. Can combine with `--scope`.                              |
| `/pi-openai unset <setting>`                               | Stage removal of the next eligible explicit value at its actual source and scope.                          |
| `/pi-openai unset <setting> --scope <scope>`               | Search only this scope, considering project then global. Do not fall through to another scope.             |
| `/pi-openai undo [setting]`                                | Discard one or all command overrides and pending edits at the automatic target scope, across both sources. |
| `/pi-openai undo [setting] --scope <scope>`                | Discard command overrides and pending edits at an explicit scope, across both sources.                     |
| `/pi-openai undo --all-scopes`                             | Clear every runtime override and pending edit.                                                             |
| `/pi-openai save`                                          | Save all pending edits to their recorded sources and scopes.                                               |
| `/pi-openai save --source global\|project`                 | Save only pending edits recorded for that source.                                                          |
| `/pi-openai save --scope <scope>`                          | Save only pending edits of this exact scope kind, across all model identities.                             |
| `/pi-openai save --source global\|project --scope <scope>` | Save only edits matching both filters. Leave all other edits pending.                                      |

Scope names are `all`, `model`, `provider`, `api`, `provider+model`, `model+api`, `provider+api`, and `provider+model+api`. For set, unset, and undo, selector identities come from the selected model:

```text
/pi-openai verbosity low --scope provider+model
/pi-openai reasoningSummary auto --scope api
/pi-openai enabled false --scope all
```

Edits capture these identities when staged. Switching models does not move existing edits. With no selected model, set/undo/unset require `--scope all`; `undo --all-scopes` can still clear everything. Saving, including filtered saving, does not require a selected model.

Commands complete setting names, canonical values, scope options, and source options. `--source` is supported only for setting values and saving. `undo` replaces the former `reset` command; `reset` is no longer accepted.

Undo affects runtime state only. It discards command overrides and pending edits, including removals, without editing files. It is not a step-by-step history undo and does not restore built-in defaults when another loaded layer supplies a value. Empty runtime-only scopes disappear once their overrides and pending edits are discarded.

### Choosing a source when setting

Without `--source`, new sets target the **trusted project file if it exists**, otherwise the global file. The choice is recorded when staging the edit, not when saving. Creating or deleting a project file afterward does not move existing pending edits.

```text
/pi-openai verbosity low --source global
/pi-openai verbosity high --scope model --source project
```

`--source global` targets global even when a project file exists. `--source project` targets project even when its file does not exist; a notice says that the file will be created **on save**. Staging never creates a file. Untrusted projects cannot be targeted. A pending project edit does not change the default destination for subsequent sets until the project file exists.

Setting an existing global value without `--source` creates or changes a project override when the trusted project file exists. It does not edit the global value. Use `--source global` when that is the intended destination. A project or environment value can still mask a saved global value after reload; forcing the destination does not bypass precedence.

Repeated edits replace only the pending operation with the same **source + scope + setting**. The same setting can have separate global and project edits. Command overrides remain a single live layer: the latest set at a scope supplies its runtime value, independently of its file destination.

### Removing saved settings

Use `unset` to stage removal of an explicit value, then save:

```text
/pi-openai unset verbosity --scope model
/pi-openai status
/pi-openai save
/reload
```

Unset records the value's actual source. Within the same scope, it selects project before global and skips removals already staged. If both files define verbosity at that scope, two unsets produce separate rows:

| Scope           | Setting   | Value   | Source  |
| --------------- | --------- | ------- | ------- |
| `model=example` | verbosity | Removed | project |
| `model=example` | verbosity | Removed | global  |

A bare `save` applies both removals to their own files. `save --source project` saves only the project removal and leaves the global removal pending. This exposes the global fallback after reload unless it is also removed.

Unset considers matching file values and pending sets for the requested key. It accounts for this session's saved values and removals, so saving between unsets does not reselect an already removed value from the loaded snapshot. Environment values and built-in defaults are never removable candidates. External file edits require a reload to update targeting.

Unset removes the runtime command override for that setting at the same scope and replaces any pending set at the selected source with a removal. Other-source pending edits remain separate. Loaded configuration is unchanged: a saved deletion affects requests only after reload or a new session. Removing an explicit value exposes inherited values, not necessarily built-in defaults.

An explicit `--scope` never falls through to another scope. If neither source still has an eligible value there, unset reports **Nothing to unset** and adds no edit. Automatic unset reports the same when no eligible scope remains. Other pending edits are unchanged.

Setting the same source, scope, and key again replaces its removal. `undo verbosity --scope model` cancels the pending verbosity edits at that scope in both sources without writing files. Pending removal scopes remain targets for set and undo. Undoing a removal makes its loaded value eligible for unset again.

When the last setting in an override is removed, saving also removes the empty override block and an empty `overrides` array. Unknown settings or extra fields are preserved rather than deleting their block. Removing an absent setting does not create a file or an override. Removed entry lines do not leave empty placeholder lines.

### Automatic target selection

Set and undo use the default target shown in status, independently of whether it defines the setting being changed:

1. Prefer more selector fields.
2. On equal field counts, prefer runtime overrides or pending edits, then project configuration, then global configuration.
3. Within the same source level, prefer model over provider over API. For two fields: provider+model > model+api > provider+api.
4. Fall back to All models when no scoped rule matches.

Unset ranks only eligible values for the requested key. It prefers more selector fields, then project over global on equal field counts, then the field ordering above. Pending sets retain their recorded file priority. It reaches All models only if that scope still defines an eligible value. In particular, a more specific global scope is visited before a broader project scope; among equally specific scopes, project values come first.

Successful set and unset confirmations name the scope and source. An explicit scope bypasses automatic scope selection. Runtime scopes remain candidates for set/undo after saving. Unset can also remove values saved during the current session after their runtime override has been undone.

Targeting is separate from effective-value resolution. All matching scopes contribute values, but a command edits only one scope. For example, a more specific global scope can be the command target while a broader project value masks it after a global save and reload. A broader command edit can also be masked by a more specific runtime override; the confirmation reports this.

### Saving

Saving writes **only pending explicit edits**. It does not copy environment values, defaults, or inherited values. Files are reread before writing, preserving intervening changes to unrelated settings, comments outside removed entries, unknown keys, and other scopes. The staged operation wins for its own source, scope, and setting.

Save options are **filters**, not destinations or retargeting instructions:

```text
/pi-openai verbosity low --scope model --source global
/pi-openai reasoningSummary auto --scope api --source project
/pi-openai save --source global --scope model
/pi-openai status
/pi-openai save
```

The filtered save writes only global model-scoped edits. The project API edit stays pending until the final save. `save --scope model` includes model-only edits for every captured model, not only the currently selected one. It excludes `provider+model` and `model+api` edits; use their exact scope names to select them. `save --scope all` selects only All models edits, not every scope. With no matching pending edits, save does nothing.

The old positional commands `save global` and `save project` are no longer accepted. Choose a destination on the **setting command** with `--source`. Use `save --source` only to select edits already recorded for that file. Save no longer supports moving edits to another scope; choose the correct `--scope` when setting the value.

Each file is replaced atomically, but a save across both files is not a single transaction. Each successful file save clears only its captured edits and produces a concise confirmation. If a later file fails, edits for failed or unattempted files remain pending; already successful saves are not repeated. Edits replaced while saving remain pending. Project trust is checked before a save that includes project edits.

**Saving does not change the current session's loaded configuration or runtime settings.** Successful saves keep runtime overrides active. Status shows saved values and **Removed** receipts separately at their recorded sources and scopes, marked for the next session/reload.

Undo after saving cannot reverse a persisted write. It exposes the configuration loaded at session start, not the newly written file. Run `/reload` or start a new session to load saved settings and clear runtime overrides. Normal project/environment precedence still applies after reload.

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
