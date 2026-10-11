# Compatibility

[Back to README](../README.md)

Default checks require a recognized endpoint and one of these OpenAI model IDs from the [built-in allowlist](../src/request/compatibility.ts):

- `gpt-5.5`
- `gpt-5.6-luna`
- `gpt-5.6-sol`
- `gpt-5.6-terra`
- `gpt-6-astra`
- `gpt-6-luna`
- `gpt-6-sol`
- `gpt-6.1-sol`

Dated variants with a `-YYYY-MM-DD` suffix are also recognized. Other vendors and open-weight models are outside the support scope.

## Feature support

These tables describe **extension behavior, not guaranteed server acceptance**, with active settings and `allowUnsupported: false`.

| Provider / Pi API                          | Verbosity                 | Reasoning summary              | Native web search |
| ------------------------------------------ | ------------------------- | ------------------------------ | ----------------- |
| OpenAI / `openai-responses`                | Set `text.verbosity`      | Set/remove `reasoning.summary` | Add `web_search`  |
| Azure / `azure-openai-responses`           | Set `text.verbosity`      | Set/remove `reasoning.summary` | Add `web_search`  |
| GitHub Copilot / `openai-responses`        | Set `text.verbosity`      | Best-effort set/remove         | Skip: unverified  |
| Recognized provider / `openai-completions` | Set top-level `verbosity` | Skip                           | Skip              |

Summaries require a reasoning-capable model. Existing native search tools are preserved, not duplicated.

## Service tiers

| Responses provider | `serviceTier: priority`                                | `serviceTier: ultrafast`     |
| ------------------ | ------------------------------------------------------ | ---------------------------- |
| OpenAI             | Allowlisted models                                     | `gpt-6-astra`, `gpt-6.1-sol` |
| Azure              | `gpt-5.5`, `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-6-sol` | Skip                         |
| GitHub Copilot     | Skip                                                   | Skip                         |

Active tiers set `service_tier` to the requested value. Chat Completions skips both tiers. OpenAI API-key and ChatGPT-subscription authentication use the same recognized provider/endpoint in Pi, but server-side capabilities can differ.

## Azure eligibility and deployment names

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

## Unsafe overrides and payload safeguards

To attempt an unverified OpenAI model or proxy for the selected provider and model only, use a [scoped command](commands.md#scope-and-source):

```text
/pi-openai allowUnsupported true --scope provider+model
```

This bypasses API, provider, endpoint, model, and feature-support checks, including Copilot restrictions. It does not establish server support or expand the intended vendor scope.

| Payload shape                           | Attempted transformations       |
| --------------------------------------- | ------------------------------- |
| String/array `input`, no `messages`     | Responses features              |
| Array `messages`, no `input`            | Chat Completions verbosity only |
| Both fields or neither compatible shape | None                            |

Validation and disabled settings still apply. Request model identity must match the selected model or expected Azure deployment, even with this flag.
Incompatible nested fields are preserved. Status cannot predict payload-specific safeguards before a request is made.
