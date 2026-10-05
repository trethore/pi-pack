import type { Destination } from "#src/constants";
import { settingNames, type Layers, type Setting, type Settings } from "#src/config/settings";
import { scopeId, scopeRules, scopeSize, type ScopeRule, type ScopedSettings, type Selector } from "#src/config/scopes";

export interface SaveReceipt extends ScopeRule {
  destination: Destination;
}
export interface Changes {
  pending: ScopeRule[];
  receipts: SaveReceipt[];
}
export interface SaveBatch {
  pending: ScopeRule[];
  patches: ScopeRule[];
}

function mergeRule(rules: ScopeRule[], match: Selector, settings: Partial<Settings>): ScopeRule[] {
  const id = scopeId(match);
  const previous = rules.find((rule) => scopeId(rule.match) === id);
  const rule = { match: { ...match }, settings: { ...previous?.settings, ...settings } };
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

function removeSetting(rules: ScopeRule[], match: Selector, setting?: Setting): ScopeRule[] {
  return rules.flatMap((rule) => {
    if (scopeId(rule.match) !== scopeId(match)) {
      return [rule];
    }
    const settings = { ...rule.settings };
    if (setting) {
      Reflect.deleteProperty(settings, setting);
    } else {
      return [];
    }
    return Object.keys(settings).length === 0 ? [] : [{ match: rule.match, settings }];
  });
}

export function resetCommand(layers: Layers, changes: Changes, match?: Selector, setting?: Setting): void {
  if (match === undefined) {
    layers.command = {};
    changes.pending = [];
    return;
  }
  layers.command = configuration(removeSetting(scopeRules(layers.command), match, setting));
  changes.pending = removeSetting(changes.pending, match, setting);
}

function mergeWithoutConflicts(target: Partial<Settings>, settings: Partial<Settings>): void {
  for (const key of settingNames) {
    if (Object.hasOwn(target, key) && Object.hasOwn(settings, key) && target[key] !== settings[key]) {
      throw new Error(`Conflicting ${key} values at the save scope; resolve them before saving.`);
    }
  }
  Object.assign(target, settings);
}

export function prepareSave(layers: Layers, changes: Changes, target?: Selector): SaveBatch {
  const pending = [...changes.pending];
  if (target === undefined || pending.length === 0) {
    return { pending, patches: pending };
  }
  const settings: Partial<Settings> = {};
  for (const rule of pending) {
    mergeWithoutConflicts(settings, rule.settings);
  }
  const existing = scopeRules(layers.command).find((rule) => scopeId(rule.match) === scopeId(target));
  if (existing) {
    // Check live target values without copying them into the persisted patch.
    mergeWithoutConflicts({ ...existing.settings }, settings);
  }
  return { pending, patches: [{ match: { ...target }, settings }] };
}

export function completeSave(changes: Changes, batch: SaveBatch, destination: Destination): void {
  // Edits replaced during an asynchronous save must remain pending.
  changes.pending = changes.pending.filter((rule) => !batch.pending.includes(rule));
  const otherDestinations = changes.receipts.filter((receipt) => receipt.destination !== destination);
  let saved: ScopeRule[] = changes.receipts.filter((receipt) => receipt.destination === destination);
  for (const patch of batch.patches) {
    saved = mergeRule(saved, patch.match, patch.settings);
  }
  changes.receipts = [...otherDestinations, ...saved.map((rule) => ({ ...rule, destination }))];
}
