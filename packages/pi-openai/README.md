# pi-openai

Control verbosity, reasoning summaries, native web search, and service tiers for OpenAI-compatible requests in Pi. \
**Default settings leave requests unchanged.**

## Installation

Requires Pi `1.0.3` or a compatible later release. From the repository root:

```sh
npm run install:global:pi-openai
```

## Quick start

Try lower verbosity for the selected model, then inspect the result:

```text
/pi-openai verbosity low --scope model
/pi-openai
```

Command overrides apply to subsequent requests without reloading, subject to precedence and compatibility checks.
To keep the pending changes:

```text
/pi-openai save
```

To discard the model-scoped verbosity override instead:

```text
/pi-openai undo verbosity --scope model
```

**Undo does not reverse saved writes.** See the command lifecycle below for save and reload behavior.

<details>
<summary>Example status output</summary>

Abbreviated example with `gpt-6-sol` selected and no configuration files:

```text
Model: openai / gpt-6-sol
API: openai-responses
Default command target: model=gpt-6-sol
Default set destination: global
```

**Temporary**

| Scope             | Setting   | Value | Source | Matches selected model |
| ----------------- | --------- | ----- | ------ | ---------------------- |
| `model=gpt-6-sol` | verbosity | low   | global | Yes                    |

**Effective settings** (other rows omitted)

| Setting   | Value | Source  | Request behavior   | Source scope      |
| --------- | ----- | ------- | ------------------ | ----------------- |
| verbosity | low   | command | Set text.verbosity | `model=gpt-6-sol` |

Status also shows loaded scopes, skipped-feature reasons, and saved receipts for the next session/reload. Pending deletions appear as **Removed**.

</details>

## Settings

Use unquoted command values, for example `/pi-openai reasoningSummary auto`.

| Setting            | Values                                        | Default   | Effect                                                                                            |
| ------------------ | --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `enabled`          | `true`, `false`                               | `true`    | `false` disables request overrides.                                                               |
| `allowUnsupported` | `true`, `false`                               | `false`   | Unsafe: bypass support checks, not payload safeguards.                                            |
| `verbosity`        | `low`, `medium`, `high`, `null`               | `null`    | Set response verbosity; `null` leaves it unchanged.                                               |
| `reasoningSummary` | `auto`, `concise`, `detailed`, `none`, `null` | `null`    | Set a summary mode; `none` removes it. `concise` is skipped unless `allowUnsupported` is enabled. |
| `webSearch`        | `true`, `false`                               | `false`   | Make native search available, without forcing its use.                                            |
| `serviceTier`      | `priority`, `ultrafast`, `default`            | `default` | Request a processing tier; see compatibility below.                                               |

`null`, `webSearch: false`, and `serviceTier: "default"` leave existing provider fields/tools unchanged; they do not reset them. The `fast` alias is accepted wherever values are configured and normalized to `priority`.

## Commands

| Command                             | Purpose                                                                                  |
| ----------------------------------- | ---------------------------------------------------------------------------------------- |
| `/pi-openai` or `/pi-openai status` | Inspect scopes, effective settings, and pending edits.                                   |
| `/pi-openai <setting> <value>`      | Set a runtime override and stage a file edit.                                            |
| `/pi-openai unset <setting>`        | Stage removal of an explicit value at its actual source.                                 |
| `/pi-openai undo [setting]`         | Discard one or all overrides and pending edits at the target scope, across both sources. |
| `/pi-openai save`                   | Write pending edits to their recorded files.                                             |

| Option                     | Available on                          | Meaning                                                |
| -------------------------- | ------------------------------------- | ------------------------------------------------------ |
| `--scope <scope>`          | Set, unset, undo, save                | Choose a scope; on save, filter by exact scope kind.   |
| `--source global\|project` | Set, save                             | Choose the file on set; filter recorded edits on save. |
| `--all-scopes`             | `undo` without a setting or `--scope` | Clear all runtime overrides and pending edits.         |

Tab completion supplies setting names, values, and options.

### Scope and source

```text
Setting command
  |
  +-- Scope: where does the setting apply?
  |     --scope given -> use the selected model's identities
  |                      (all needs no model)
  |     omitted       -> most specific existing matching scope
  |                      (All models if none matches)
  |
  +-- Source: which file will save modify?
        --source given -> global or trusted project
        omitted        -> trusted project file exists?
                            yes -> project
                            no  -> global
```

For example, persist a model-specific setting globally, even when a project file exists:

```text
/pi-openai verbosity low --scope model --source global
/pi-openai save --source global --scope model
```

**Save options filter edits; they never move them.** Scope and source are captured when an edit is staged. Switching models or creating/deleting the project file does not retarget it. `--source project` can create the file, but only on save.

<details>
<summary>Scope names and automatic targeting</summary>

Scopes: `all`, `model`, `provider`, `api`, `provider+model`, `model+api`, `provider+api`, `provider+model+api`.

Set and undo choose one matching scope, regardless of whether it defines the requested setting:

1. More selector fields win.
2. Ties prefer runtime overrides/pending edits, then project, then global.
3. Remaining ties prefer `model > provider > api`; for pairs, `provider+model > model+api > provider+api`.
4. With no scoped match, use All models.

Unset considers only eligible values for its setting: more fields first, then project before global, then the field ordering above. Pending sets use their recorded file priority. An explicit scope never falls through to another scope.

Targeting is not precedence: a specific global scope can be targeted while a broader project value wins after reload. A more specific runtime override can also mask a command; its confirmation reports this.

Without a selected model, set/unset/undo require `--scope all`. Saving and `undo --all-scopes` need no model.

</details>

### What changes when?

| Action                   | Current session                                                                       | Files                      |
| ------------------------ | ------------------------------------------------------------------------------------- | -------------------------- |
| Set                      | Updates the command override; more specific command scopes can mask it                | Unchanged; set staged      |
| `unset`                  | Clears that setting's command override at the target scope; loaded file values remain | Unchanged; deletion staged |
| `undo`                   | Discards targeted overrides and pending edits                                         | Unchanged                  |
| `save`                   | Active settings stay unchanged                                                        | Writes pending edits       |
| `/reload` or new session | Reloads configuration; clears runtime overrides and pending edits                     | No additional writes       |

Save anything you want to keep **before reloading**. Undo exposes loaded/inherited values, not necessarily defaults. After a save, it exposes the session's loaded configuration, not the newly written file.

<details>
<summary>Remove saved values</summary>

```text
/pi-openai unset verbosity --scope model
/pi-openai status
/pi-openai save
/reload
```

At this scope, unset selects project before global. If both files define verbosity, repeating unset stages two independent removals:

| Scope             | Setting   | Value   | Source  |
| ----------------- | --------- | ------- | ------- |
| `model=gpt-6-sol` | verbosity | Removed | project |
| `model=gpt-6-sol` | verbosity | Removed | global  |

- Unset tracks pending sets and this session's saved edits, skipping already removed values. Environment values and defaults are not removable.
- With no eligible value, it reports **Nothing to unset** and changes nothing.
- Setting the same source/scope/key replaces its removal. Undo cancels pending edits at that scope across both sources, including removals.
- Removing a project value can expose a global fallback. External file edits require reload before unset can target them.

</details>

<details>
<summary>Filtered saves and write guarantees</summary>

```text
/pi-openai verbosity low --scope model --source global
/pi-openai reasoningSummary auto --scope api --source project
/pi-openai save --source global --scope model
```

Only the global model edit is saved; the project API edit stays pending.

| Filter             | Selects                                                        |
| ------------------ | -------------------------------------------------------------- |
| `--source project` | Edits recorded for the project file                            |
| `--scope model`    | Model-only edits for every captured model, not combined scopes |
| `--scope all`      | All-models edits, not every scope                              |
| Both flags         | Edits matching both filters                                    |

- Repeated edits replace the same source/scope/key operation. Global and project edits stay separate; the latest set at a scope supplies its runtime value regardless of destination.
- Only pending edits are written, never inherited/environment/default values. No matching edits means no write.
- Files are reread before writing. Unrelated values, unknown fields, and comments outside removed entries are preserved; the staged edit wins for its own key and scope.
- Removing the last setting prunes empty override blocks unless unknown fields remain. Removing an absent setting creates nothing.
- Each file is replaced atomically, but saving both files is not one transaction. Failed/unattempted writes and edits replaced during saving remain pending. Successful writes are not repeated.
- Project trust is checked before a batch containing project edits. Successful saves retain runtime overrides; status records saved values/removals separately.

</details>

## Configuration

No file is required. To configure defaults and scoped overrides:

| Source  | Path                                                                           |
| ------- | ------------------------------------------------------------------------------ |
| Project | `.pi/pi-openai.jsonc`                                                          |
| Global  | `~/.pi/agent/pi-openai.jsonc` (follows `$PI_CODING_AGENT_DIR` when customized) |

```jsonc
{
  "verbosity": "medium",
  "overrides": [
    {
      "match": { "provider": "openai", "model": "gpt-6-sol" },
      "settings": { "verbosity": "low", "reasoningSummary": "auto" },
    },
  ],
}
```

Top-level settings apply to All models; every setting can also appear in `settings`. Comments and trailing commas are supported. Run `/reload` after editing files. Untrusted project files are neither loaded nor targeted for edits.

Settings merge **per key**, strongest layer first:

```text
commands > environment > project > global > defaults
```

Project values beat global values **even when the global selector is more specific**. Omitted keys inherit; explicit `null` cancels an inherited verbosity/summary override without deleting provider payload fields.

<details>
<summary>Selector matching and precedence within a layer</summary>

A `match` requires one or more of `provider`, `model`, and `api`; all supplied fields must match exactly. `model` is Pi's selected model ID, not an Azure deployment name. `api` is an identifier such as `openai-responses`, not an endpoint or authentication method.

| Matching rule                | Dated model IDs                                                              |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Configuration selectors      | Exact only; `gpt-6-sol` does not match `gpt-6-sol-2026-09-22`. No wildcards. |
| Request compatibility checks | Strip a `-YYYY-MM-DD` suffix before checking model-family allowlists.        |

Within each file or the command layer, matching scopes contribute explicit keys in this order, strongest first:

```text
provider+model+api > provider+model > model+api > provider+api
                  > model > provider > api > All models
```

Declaration order does not matter. For example, model-scoped verbosity can override provider-scoped verbosity while retaining provider-scoped service tier.

</details>

<details>
<summary>Environment variables</summary>

```sh
PI_OPENAI_VERBOSITY=low PI_OPENAI_WEB_SEARCH=true pi
```

| Variable                      | Setting            |
| ----------------------------- | ------------------ |
| `PI_OPENAI_ENABLED`           | `enabled`          |
| `PI_OPENAI_ALLOW_UNSUPPORTED` | `allowUnsupported` |
| `PI_OPENAI_VERBOSITY`         | `verbosity`        |
| `PI_OPENAI_REASONING_SUMMARY` | `reasoningSummary` |
| `PI_OPENAI_WEB_SEARCH`        | `webSearch`        |
| `PI_OPENAI_SERVICE_TIER`      | `serviceTier`      |

Values use command spelling. Environment values are unscoped and override both files, but not commands.

</details>

## Compatibility

Default checks require a recognized endpoint and an OpenAI model in the [built-in allowlist](src/request/compatibility.ts), including dated variants. Other vendors and open-weight models are outside the support scope.

These tables describe **extension behavior, not guaranteed server acceptance**, with active settings and `allowUnsupported: false`.

| Provider / Pi API                          | Verbosity                 | Reasoning summary              | Native web search |
| ------------------------------------------ | ------------------------- | ------------------------------ | ----------------- |
| OpenAI / `openai-responses`                | Set `text.verbosity`      | Set/remove `reasoning.summary` | Add `web_search`  |
| Azure / `azure-openai-responses`           | Set `text.verbosity`      | Set/remove `reasoning.summary` | Add `web_search`  |
| GitHub Copilot / `openai-responses`        | Set `text.verbosity`      | Best-effort set/remove         | Skip: unverified  |
| Recognized provider / `openai-completions` | Set top-level `verbosity` | Skip                           | Skip              |

Summaries require a reasoning-capable model. Existing native search tools are preserved, not duplicated.

| Responses provider | `serviceTier: priority`                                | `serviceTier: ultrafast` |
| ------------------ | ------------------------------------------------------ | ------------------------ |
| OpenAI             | Allowlisted models                                     | `gpt-6-astra` only       |
| Azure              | `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-sol` | Skip                     |
| GitHub Copilot     | Skip                                                   | Skip                     |

Active tiers set `service_tier` to the requested value. Chat Completions skips both tiers. OpenAI API-key and ChatGPT-subscription authentication use the same recognized provider/endpoint in Pi, but server-side capabilities can differ.

<details>
<summary>Azure eligibility and deployment names</summary>

- **Priority:** Check Azure's [model/version, region, and deployment eligibility](https://learn.microsoft.com/en-us/azure/foundry/openai/concepts/priority-processing). Eligible deployment types are Global Standard and US Data Zone Standard, not Regional Standard or EU Data Zone Standard.
  Priority requests can fall back to standard processing. Azure also lists `gpt-6.1-sol` in its latency targets; this extension skips its priority override by default.
- **Web search:** Azure's [Responses guide](https://learn.microsoft.com/en-us/azure/foundry/openai/how-to/web-search) documents `web_search`. Administrators can block it. Bing grounding sends data outside your compliance and geographic boundaries.

The extension does not check deployment eligibility or subscription policies. Status reports model-level compatibility, not individual request acceptance.

For `azure` with `azure-openai-responses`, map the selected model to the outgoing deployment name:

```sh
AZURE_OPENAI_DEPLOYMENT_NAME_MAP="gpt-5.5=production-assistant" pi
```

```text
Selected model: gpt-5.5              -> support checks use gpt-5.5
Request model: production-assistant -> identity check passes
```

Without a mapping, the request must name the selected model ID. Request-specific deployment options and scoped environment overrides are not exposed to the extension; a different deployment name leaves the request unchanged.

</details>

<details>
<summary>Unsafe overrides and payload safeguards</summary>

To attempt an unverified OpenAI model or proxy:

```text
/pi-openai allowUnsupported true
```

This bypasses API, provider, endpoint, model, and feature-support checks, including Copilot restrictions. It does not establish server support or expand the intended vendor scope.

| Payload shape                           | Attempted transformations       |
| --------------------------------------- | ------------------------------- |
| String/array `input`, no `messages`     | Responses features              |
| Array `messages`, no `input`            | Chat Completions verbosity only |
| Both fields or neither compatible shape | None                            |

Validation and disabled settings still apply. Request model identity must match the selected model or expected Azure deployment, even with this flag.
Incompatible nested fields are preserved. Status cannot predict payload-specific safeguards before a request is made.

</details>

## Troubleshooting

**Q: Why does a command have no visible effect?**  
A: Run `/pi-openai` and inspect the effective scope, disabled settings, and skip reasons.

**Q: Why does a saved value disappear after reload?**  
A: Project and environment precedence still applies. `--source global` does not bypass it.

**Q: Why is configuration unavailable?**  
A: Invalid files or environment values stop all extension overrides. Fix the error, then reload. Restart Pi if you need to supply corrected shell environment values.

**Q: Why is a project edit refused?**  
A: The project must be trusted before it can be edited.

Configuration validation includes nonmatching scopes.
Duplicate known keys/selectors and unknown selector fields are errors; unknown settings produce warnings.

## License

Licensed under the [MIT License](../../LICENSE).
