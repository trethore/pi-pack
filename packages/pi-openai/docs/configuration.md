# Configuration

[Back to README](../README.md)

## Settings

Use unquoted [command](commands.md) values, for example `/pi-openai reasoningSummary auto`.

| Setting            | Values                                        | Default   | Effect                                                                                            |
| ------------------ | --------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------- |
| `enabled`          | `true`, `false`                               | `true`    | `false` disables request overrides.                                                               |
| `allowUnsupported` | `true`, `false`                               | `false`   | Unsafe: bypass support checks, not payload safeguards.                                            |
| `verbosity`        | `low`, `medium`, `high`, `null`               | `null`    | Set response verbosity; `null` leaves it unchanged.                                               |
| `reasoningSummary` | `auto`, `concise`, `detailed`, `none`, `null` | `null`    | Set a summary mode; `none` removes it. `concise` is skipped unless `allowUnsupported` is enabled. |
| `webSearch`        | `true`, `false`                               | `false`   | Make native search available, without forcing its use.                                            |
| `serviceTier`      | `priority`, `ultrafast`, `default`            | `default` | Request a processing tier; see [compatibility](compatibility.md).                                 |

`null`, `webSearch: false`, and `serviceTier: "default"` leave existing provider fields/tools unchanged; they do not reset them. The `fast` alias is accepted wherever values are configured and normalized to `priority`.

## Files

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

Top-level settings apply to All models; every setting can also appear in `settings`. Comments and trailing commas are supported. Run `/reload` after editing files.

### Project trust

Untrusted project files are neither loaded nor targeted for edits.

## Precedence

Settings merge **per key**, strongest layer first:

```text
commands > environment > project > global > defaults
```

Project values beat global values **even when the global selector is more specific**. Omitted keys inherit; explicit `null` cancels an inherited verbosity/summary override without deleting provider payload fields.

## Selector matching and precedence within a layer

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

These rules resolve effective settings. [Automatic command targeting](commands.md#scope-names-and-automatic-targeting) selects which scope a command edits and uses different rules.

## Environment variables

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

## Validation

Invalid files or environment values stop all extension overrides. Configuration validation includes nonmatching scopes.
Duplicate known keys/selectors and unknown selector fields are errors; unknown settings produce warnings.

Fix configuration errors, then run `/reload`. Restart Pi if you need to supply corrected shell environment values.
See [troubleshooting](troubleshooting.md) for common configuration problems.
