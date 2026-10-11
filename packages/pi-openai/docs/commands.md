# Commands

[Back to README](../README.md)

See [configuration](configuration.md#settings) for setting names, values, and defaults.

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

## Scope and source

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

### Scope names and automatic targeting

Scopes: `all`, `model`, `provider`, `api`, `provider+model`, `model+api`, `provider+api`, `provider+model+api`.

Set and undo choose one matching scope, regardless of whether it defines the requested setting:

1. More selector fields win.
2. Ties prefer runtime overrides/pending edits, then project, then global.
3. Remaining ties prefer `model > provider > api`; for pairs, `provider+model > model+api > provider+api`.
4. With no scoped match, use All models.

Unset considers only eligible values for its setting: more fields first, then project before global, then the field ordering above. Pending sets use their recorded file priority. An explicit scope never falls through to another scope.

Targeting is not [configuration precedence](configuration.md#precedence): a specific global scope can be targeted while a broader project value wins after reload. A more specific runtime override can also mask a command; its confirmation reports this.

Without a selected model, set/unset/undo require `--scope all`. Saving and `undo --all-scopes` need no model.

## What changes when?

| Action                   | Current session                                                                       | Files                      |
| ------------------------ | ------------------------------------------------------------------------------------- | -------------------------- |
| Set                      | Updates the command override; more specific command scopes can mask it                | Unchanged; set staged      |
| `unset`                  | Clears that setting's command override at the target scope; loaded file values remain | Unchanged; deletion staged |
| `undo`                   | Discards targeted overrides and pending edits                                         | Unchanged                  |
| `save`                   | Active settings stay unchanged                                                        | Writes pending edits       |
| `/reload` or new session | Reloads configuration; clears runtime overrides and pending edits                     | No additional writes       |

**Undo does not reverse saved writes.** Save anything you want to keep **before reloading**. Undo exposes loaded/inherited values, not necessarily defaults. After a save, it exposes the session's loaded configuration, not the newly written file.

### Remove saved values

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

### Filtered saves and write guarantees

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

## Example status output

Abbreviated example with `gpt-6-sol` selected, no configuration files, and a pending override from:

```text
/pi-openai verbosity low --scope model
/pi-openai
```

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

Request behavior describes intended changes, not guaranteed server acceptance.

See [compatibility](compatibility.md) and [troubleshooting](troubleshooting.md).
