# pi-account

Save multiple provider logins and switch accounts in the current Pi session.

## Features

- Saves named OAuth and API-key accounts with separate credentials managed by Pi.
- Uses registered providers, including providers added by other extensions.
- Switches accounts for the current session without changing global defaults.
- Provides a searchable account picker and direct account commands.
- Keeps each original provider's existing authentication available as `default`.
- Integrates with pi-codexify when using Codex accounts.

## Installation

Requires Pi `>=0.85.0 <1`.

From the `pi-pack` repository root, install globally:

```sh
pi install ./packages/pi-account
```

Or install for the current project:

```sh
pi install -l ./packages/pi-account
```

For development, load the extension directly:

```sh
pi -e ./packages/pi-account
```

## Usage

1. Select a model from the desired provider with `/model`.
2. Run `/account add personal`.
3. Submit the prepared `/login ...` command and complete the provider's login flow.
4. Repeat with `/account add work`, using the other account or API key.
5. Run `/account` and select an account, or use `/account work` directly.

Adding an account does not switch the active model. For browser login flows,
choose the intended account in the browser.

### Commands

| Command                          | Action                                                    |
| -------------------------------- | --------------------------------------------------------- |
| `/account`                       | Open the searchable account picker.                       |
| `/account <name>`                | Switch to a saved account.                                |
| `/account add <name>`            | Add an account for the current model's original provider. |
| `/account add <name> <provider>` | Add an account for a specific registered provider ID.     |
| `/account default`               | Switch back to the current account's original provider.   |
| `/account default <provider>`    | Switch to a specific original provider.                   |

For example:

```text
/account add personal openai-codex
/account add work anthropic
/account add company my-extension-provider
```

Use the original provider ID, not an account alias. The provider argument is
case-sensitive. An explicit provider is required when no model is selected.
The **Add account** picker entry uses the current model's original provider.
Outside the terminal UI, use the direct commands instead of the picker.

The picker marks the current account with `*` and shows each account's provider.
It includes a `default` entry for each saved account's original provider and the
current model's original provider. These entries use existing authentication
without copying or moving credentials.

Names use 1-48 letters, digits, hyphens, or underscores, starting with a letter or
digit. Names are normalized to lowercase and are unique across providers.
`default` and `add` are reserved. Re-adding a name for the same provider is safe;
assigning that name to a different provider is rejected.

### Switching models

Switching retains the model ID and thinking level, subject to Pi's supported
thinking levels. Cached available models do not require network access. If the
current model is missing, the selected account's catalog is refreshed with
network access allowed. The provider's availability filter is respected.
If that account still does not offer the current model, select a model under the
account's provider with `/model`. No different model is selected automatically.

Switching is blocked while a response is running. There is no automatic failover
or global active-account setting.

## Supported providers

The extension resolves the original provider through Pi's model registry. There
is no built-in provider allowlist. Providers registered by other extensions use
the same path as built-in providers.

A provider must expose at least one stored-credential login flow through Pi's
provider primitives:

- `auth.oauth`: OAuth login, refresh, and request-auth conversion.
- `auth.apiKey.login`: API-key or provider-scoped configuration login, with
  `auth.apiKey.resolve` for request authentication.

Providers with both methods retain both login choices. Named aliases require
their own saved credentials: a logged-out alias does not fall back to the
original provider's credentials or ambient API-key resolution. The `default`
entry retains the original provider's authentication behavior.

Ambient-only providers, including providers that only discover environment
credentials or local credential files, are not offered as separate accounts
unless they also expose a stored-credential login flow. Keyless local providers
have no independent login to save.

Provider endpoints, headers, streaming methods, deferred operations, model
filters, and dynamic model-refresh hooks are retained. Dynamic catalog storage
uses the alias provider ID; cached models are translated back to the original
provider ID before invoking its refresh hook.

### Provider integration limits

Providers must honor the credentials and resolved request authentication passed
by Pi. An extension that ignores stored credentials, hardcodes authentication,
or assumes its original provider ID in streaming code can require changes in
that extension. Having a login method alone cannot guarantee account isolation
inside arbitrary provider code.

Dynamic refresh hooks run on the original provider instance. Alias catalog
snapshots and persisted catalogs are separate, but provider-private mutable
state is not cloned. Providers that keep account-specific state in shared
closures or caches can require provider-side isolation support.

Aliases are registered when the session context becomes available and are
synchronized again by `/account`. Providers loaded later are discovered on the
next command. Missing providers leave saved metadata intact; load the original
provider extension before using those accounts. If Pi selects an initial model
before aliases are registered, reselect the account with `/account <name>` after
startup or session resume.

## Storage and scope

- Account names and original provider IDs are stored in
  `~/.pi/agent/pi-account/accounts/<name>.json`.
- Credentials stay in Pi's `auth.json`, in separate provider slots. Pi handles
  login, token refresh, and credential-file locking.
- Codex aliases keep `openai-codex-account-<name>` provider IDs. Other aliases use
  `pi-account-<hex-encoded-provider-id>-<name>`. Use the prepared `/login` command
  rather than constructing these IDs manually.
- Account selection is session-local and is recorded by Pi with the model change.
  It does not change other running instances or global model defaults.
- Instances using the same agent directory share saved accounts and credentials.
  Open `/account` to discover accounts added by another instance.
- Pi's custom agent directory setting is respected.

Existing name-only account files are read as Codex accounts. Their provider IDs
and saved credentials remain unchanged; no login migration is needed.

Use `/logout` to remove an account's saved login. This affects instances sharing
that credential store, unlike switching accounts. An expired or revoked refresh
token can require signing in again. Re-adding an existing name does not remove its
credentials; logging in again under that name replaces that alias's login.

Account metadata contains no tokens. Do not copy refresh tokens between aliases.
The extension does not read browser sessions or modify external CLI logins.

## pi-codexify

Codex account aliases work with pi-codexify's request controls, web search,
priority routing hints, usage lookup, and reset command. Usage and reset use the
selected Codex account. Accounts for other providers do not become Codex accounts
and do not gain these Codex-specific features.

## License

[MIT](../../LICENSE)
