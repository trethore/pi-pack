import type { Destination } from "#src/constants";
import { settingNames, type Layers, type Setting, type Settings } from "#src/config/settings";
import {
  commandScopeRules,
  explicitScope,
  scopeId,
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
export interface SaveReceipt extends ScopePatch {
  destination: Destination;
}
export interface Changes {
  pending: ScopePatch[];
  receipts: SaveReceipt[];
}
export interface SaveBatch {
  pending: ScopePatch[];
  patches: ScopePatch[];
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

export function setCommand(layers: Layers, changes: Changes, match: Selector, override: Partial<Settings>): void {
  layers.command = configuration(mergeRule(scopeRules(layers.command), match, override));
  changes.pending = mergeRule(changes.pending, match, override);
}

function removeSetting(rules: ScopePatch[], match: Selector, setting?: Setting): ScopePatch[] {
  return rules.flatMap((rule) => {
    if (scopeId(rule.match) !== scopeId(match)) {
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
    return [{ match: rule.match, settings, ...(unset.length > 0 ? { unset } : {}) }];
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

function savedConfiguration(layers: Layers, changes: Changes, destination: Destination): ScopedSettings {
  let rules: ScopePatch[] = scopeRules(layers[destination]);
  for (const receipt of changes.receipts.filter((entry) => entry.destination === destination)) {
    rules = mergeRule(rules, receipt.match, receipt.settings, receipt.unset);
  }
  return configuration(rules);
}

export function unsetScope(
  layers: Layers,
  changes: Changes,
  model: ModelIdentity | undefined,
  setting: Setting,
  scope?: ScopeName,
): Selector | undefined {
  const explicit = scope === undefined ? undefined : explicitScope(scope, model);
  if (!model && explicit === undefined) {
    throw new Error("No model selected; use --scope all.");
  }
  // Saved receipts affect what can still be removed, not the active request settings.
  const projected = {
    ...layers,
    global: savedConfiguration(layers, changes, "global"),
    project: savedConfiguration(layers, changes, "project"),
  };
  const removed = new Set(
    changes.pending.filter((patch) => patch.unset?.includes(setting)).map((patch) => scopeId(patch.match)),
  );
  const candidate = commandScopeRules(projected, model, changes.pending).find(
    (rule) =>
      Object.hasOwn(rule.settings, setting) &&
      !removed.has(scopeId(rule.match)) &&
      (explicit === undefined || scopeId(rule.match) === scopeId(explicit)),
  );
  return candidate ? { ...candidate.match } : undefined;
}

export function unsetCommand(layers: Layers, changes: Changes, match: Selector, setting: Setting): void {
  layers.command = configuration(removeSetting(scopeRules(layers.command), match, setting));
  changes.pending = mergeRule(changes.pending, match, {}, [setting]);
}

function rejectConflicts(target: ScopePatch, patch: ScopePatch): void {
  const targetKeys = patchKeys(target);
  for (const key of patchKeys(patch)) {
    if (
      targetKeys.includes(key) &&
      (Boolean(target.unset?.includes(key)) !== Boolean(patch.unset?.includes(key)) ||
        target.settings[key] !== patch.settings[key])
    ) {
      throw new Error(`Conflicting ${key} edits at the save scope; resolve them before saving.`);
    }
  }
}

export function prepareSave(layers: Layers, changes: Changes, target?: Selector): SaveBatch {
  const pending = [...changes.pending];
  if (target === undefined || pending.length === 0) {
    return { pending, patches: pending };
  }
  let patches: ScopePatch[] = [];
  const existing = scopeRules(layers.command).find((rule) => scopeId(rule.match) === scopeId(target));
  for (const rule of pending) {
    if (patches[0]) {
      rejectConflicts(patches[0], rule);
    }
    if (existing) {
      // Check live target values without copying them into the persisted patch.
      rejectConflicts(existing, rule);
    }
    patches = mergeRule(patches, target, rule.settings, rule.unset);
  }
  return { pending, patches };
}

export function completeSave(changes: Changes, batch: SaveBatch, destination: Destination): void {
  // Edits replaced during an asynchronous save must remain pending.
  changes.pending = changes.pending.filter((rule) => !batch.pending.includes(rule));
  const otherDestinations = changes.receipts.filter((receipt) => receipt.destination !== destination);
  let saved: ScopePatch[] = changes.receipts.filter((receipt) => receipt.destination === destination);
  for (const patch of batch.patches) {
    saved = mergeRule(saved, patch.match, patch.settings, patch.unset);
  }
  changes.receipts = [...otherDestinations, ...saved.map((rule) => ({ ...rule, destination }))];
}
