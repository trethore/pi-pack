import type { Destination } from "#src/constants";
import { settingNames, type Layers, type Setting, type Settings } from "#src/config/settings";
import {
  explicitScope,
  matchesScope,
  matchesScopeFilter,
  scopeId,
  scopeRank,
  scopeRules,
  scopeSize,
  type ModelIdentity,
  type ScopeName,
  type ScopeRule,
  type ScopedSettings,
  type Selector,
} from "#src/config/scopes";

export interface ScopePatch extends ScopeRule {
  unset?: Setting[];
}
export interface FilePatch extends ScopePatch {
  destination: Destination;
}
export interface Changes {
  pending: FilePatch[];
  receipts: FilePatch[];
}
export interface SaveFilters {
  scope?: ScopeName;
  source?: Destination;
}
export interface EditTarget {
  match: Selector;
  destination: Destination;
}

export function patchKeys(patch: ScopePatch): Setting[] {
  return settingNames.filter((key) => Object.hasOwn(patch.settings, key) || patch.unset?.includes(key));
}

function mergeRule(
  rules: ScopePatch[],
  match: Selector,
  settings: Partial<Settings>,
  unset: Setting[] = [],
): ScopePatch[] {
  const id = scopeId(match);
  const previous = rules.find((rule) => scopeId(rule.match) === id);
  const values = { ...previous?.settings, ...settings };
  for (const key of unset) {
    Reflect.deleteProperty(values, key);
  }
  const removed = settingNames.filter(
    (key) => unset.includes(key) || (previous?.unset?.includes(key) && !Object.hasOwn(settings, key)),
  );
  const rule = { match: { ...match }, settings: values, ...(removed.length > 0 ? { unset: removed } : {}) };
  return [...rules.filter((entry) => scopeId(entry.match) !== id), rule];
}

function configuration(rules: ScopeRule[]): ScopedSettings {
  const unscoped = rules.find((rule) => scopeSize(rule.match) === 0)?.settings ?? {};
  const overrides = rules.filter((rule) => scopeSize(rule.match) > 0);
  return overrides.length === 0 ? { ...unscoped } : { ...unscoped, overrides };
}

function stageEdit(changes: Changes, patch: FilePatch): void {
  const keys = patchKeys(patch);
  changes.pending = changes.pending.filter(
    (entry) =>
      entry.destination !== patch.destination ||
      scopeId(entry.match) !== scopeId(patch.match) ||
      !patchKeys(entry).some((key) => keys.includes(key)),
  );
  changes.pending.push(patch);
}

export function setCommand(
  layers: Layers,
  changes: Changes,
  match: Selector,
  override: Partial<Settings>,
  destination: Destination,
): void {
  layers.command = configuration(mergeRule(scopeRules(layers.command), match, override));
  // Separate settings retain their identity when another edit changes during a save.
  for (const key of settingNames.filter((setting) => Object.hasOwn(override, setting))) {
    stageEdit(changes, { destination, match: { ...match }, settings: { [key]: override[key] } });
  }
}

function removeSetting<T extends ScopePatch>(rules: T[], match: Selector, setting?: Setting): T[] {
  return rules.flatMap((rule) => {
    if (scopeId(rule.match) !== scopeId(match) || (setting !== undefined && !patchKeys(rule).includes(setting))) {
      return [rule];
    }
    if (!setting) {
      return [];
    }
    const settings = { ...rule.settings };
    Reflect.deleteProperty(settings, setting);
    const unset = rule.unset?.filter((key) => key !== setting) ?? [];
    if (Object.keys(settings).length === 0 && unset.length === 0) {
      return [];
    }
    const remaining = { ...rule, settings };
    Reflect.deleteProperty(remaining, "unset");
    return [{ ...remaining, ...(unset.length > 0 ? { unset } : {}) }];
  });
}

export function undoCommand(layers: Layers, changes: Changes, match?: Selector, setting?: Setting): void {
  if (match === undefined) {
    layers.command = {};
    changes.pending = [];
    return;
  }
  layers.command = configuration(removeSetting(scopeRules(layers.command), match, setting));
  changes.pending = removeSetting(changes.pending, match, setting);
}

function editedConfiguration(layers: Layers, changes: Changes, destination: Destination): ScopedSettings {
  let rules: ScopePatch[] = scopeRules(layers[destination]);
  for (const patch of [...changes.receipts, ...changes.pending].filter((entry) => entry.destination === destination)) {
    rules = mergeRule(rules, patch.match, patch.settings, patch.unset);
  }
  return configuration(rules);
}

export function unsetTarget(
  layers: Layers,
  changes: Changes,
  model: ModelIdentity | undefined,
  setting: Setting,
  scope?: ScopeName,
  projectTrusted = true,
): EditTarget | undefined {
  const explicit = scope === undefined ? undefined : explicitScope(scope, model);
  if (!model && explicit === undefined) {
    throw new Error("No model selected; use --scope all.");
  }
  const destinations: Destination[] = projectTrusted ? ["project", "global"] : ["global"];
  // Saved and pending edits affect removal targeting, not the loaded request settings.
  const candidates = destinations.flatMap((destination, priority) =>
    scopeRules(editedConfiguration(layers, changes, destination))
      .filter(
        (rule) =>
          matchesScope(rule.match, model) &&
          Object.hasOwn(rule.settings, setting) &&
          (explicit === undefined || scopeId(rule.match) === scopeId(explicit)),
      )
      .map((rule) => ({ match: rule.match, destination, priority })),
  );
  candidates.sort(
    (left, right) =>
      scopeSize(right.match) - scopeSize(left.match) ||
      left.priority - right.priority ||
      scopeRank(right.match) - scopeRank(left.match),
  );
  const target = candidates[0];
  return target ? { match: { ...target.match }, destination: target.destination } : undefined;
}

export function unsetCommand(
  layers: Layers,
  changes: Changes,
  match: Selector,
  setting: Setting,
  destination: Destination,
): void {
  layers.command = configuration(removeSetting(scopeRules(layers.command), match, setting));
  stageEdit(changes, { destination, match: { ...match }, settings: {}, unset: [setting] });
}

export function prepareSave(changes: Changes, filters: SaveFilters = {}): FilePatch[] {
  return changes.pending.filter(
    (patch) =>
      (filters.source === undefined || patch.destination === filters.source) &&
      (filters.scope === undefined || matchesScopeFilter(patch.match, filters.scope)),
  );
}

export function completeSave(changes: Changes, batch: FilePatch[]): void {
  // Edits replaced during an asynchronous save must remain pending.
  changes.pending = changes.pending.filter((rule) => !batch.includes(rule));
  for (const patch of batch) {
    const otherDestinations = changes.receipts.filter((receipt) => receipt.destination !== patch.destination);
    const saved = mergeRule(
      changes.receipts.filter((receipt) => receipt.destination === patch.destination),
      patch.match,
      patch.settings,
      patch.unset,
    );
    changes.receipts = [...otherDestinations, ...saved.map((rule) => ({ ...rule, destination: patch.destination }))];
  }
}
