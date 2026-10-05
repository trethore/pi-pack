import { isObject } from "@pi-pack/shared/validation";
import type { Layers, Settings } from "#src/config/settings";

const selectorFields = ["provider", "model", "api"] as const;
type SelectorField = (typeof selectorFields)[number];
export type Selector = Partial<Record<SelectorField, string>>;
export interface ModelIdentity {
  provider: string;
  id: string;
  api: string;
}
export interface ScopeRule {
  match: Selector;
  settings: Partial<Settings>;
}
export interface ScopedSettings extends Partial<Settings> {
  overrides?: ScopeRule[];
}

const scopeFields = {
  all: [],
  api: ["api"],
  provider: ["provider"],
  model: ["model"],
  "provider+api": ["provider", "api"],
  "model+api": ["model", "api"],
  "provider+model": ["provider", "model"],
  "provider+model+api": ["provider", "model", "api"],
} as const satisfies Record<string, readonly SelectorField[]>;
export type ScopeName = keyof typeof scopeFields;
export const scopeNames = Object.keys(scopeFields).filter(isScopeName);

export function isScopeName(value: string): value is ScopeName {
  return Object.hasOwn(scopeFields, value);
}

export function validateSelector(input: unknown): Selector {
  if (!isObject(input) || Object.keys(input).length === 0) {
    throw new Error("match must be a nonempty selector object");
  }
  for (const key of Object.keys(input)) {
    if (!selectorFields.some((field) => field === key)) {
      throw new Error(`Unknown selector field: ${key}`);
    }
  }
  const selector: Selector = {};
  for (const field of selectorFields) {
    if (Object.hasOwn(input, field)) {
      const value = input[field];
      if (typeof value !== "string" || value.trim() === "") {
        throw new Error(`match.${field} must be a nonempty string`);
      }
      selector[field] = value;
    }
  }
  return selector;
}

export function scopeId(selector: Selector): string {
  return JSON.stringify(selectorFields.map((field) => selector[field] ?? null));
}

export function scopeSize(selector: Selector): number {
  return selectorFields.filter((field) => selector[field] !== undefined).length;
}

export function scopeRank(selector: Selector): number {
  return (
    scopeSize(selector) * 8 +
    (selector.model === undefined ? 0 : 4) +
    (selector.provider === undefined ? 0 : 2) +
    (selector.api === undefined ? 0 : 1)
  );
}

export function scopeLabel(selector: Selector): string {
  const fields = selectorFields.filter((field) => selector[field] !== undefined);
  return fields.length === 0
    ? "All models"
    : fields.map((field) => `${field}=${(selector[field] ?? "").replace(/\p{Cc}/gu, "?")}`).join(", ");
}

export function matchesScope(selector: Selector, model: ModelIdentity | undefined): boolean {
  if (scopeSize(selector) === 0) {
    return true;
  }
  if (!model) {
    return false;
  }
  const identity = { provider: model.provider, model: model.id, api: model.api };
  return selectorFields.every((field) => selector[field] === undefined || selector[field] === identity[field]);
}

export function scopeRules(settings: ScopedSettings): ScopeRule[] {
  const { overrides = [], ...unscoped } = settings;
  return [{ match: {}, settings: unscoped }, ...overrides];
}

export function matchesScopeFilter(selector: Selector, scope: ScopeName): boolean {
  const fields: readonly SelectorField[] = scopeFields[scope];
  return selectorFields.every((field) => (selector[field] !== undefined) === fields.includes(field));
}

export function explicitScope(scope: ScopeName, model: ModelIdentity | undefined): Selector {
  if (scope === "all") {
    return {};
  }
  if (!model) {
    throw new Error("No model selected; use --scope all.");
  }
  const identity = { provider: model.provider, model: model.id, api: model.api };
  const match: Selector = {};
  for (const field of scopeFields[scope]) {
    if (!identity[field]) {
      throw new Error(`Selected model has no ${field} identity.`);
    }
    match[field] = identity[field];
  }
  return match;
}

function commandScopeRules(layers: Layers, model: ModelIdentity | undefined, pending: ScopeRule[] = []): ScopeRule[] {
  const candidates = (["global", "project", "command"] as const).flatMap((source, priority) =>
    [...scopeRules(layers[source]), ...(source === "command" ? pending : [])]
      .filter((rule) => matchesScope(rule.match, model))
      .map((rule) => ({ rule, priority })),
  );
  candidates.sort(
    (left, right) =>
      scopeSize(right.rule.match) - scopeSize(left.rule.match) ||
      right.priority - left.priority ||
      scopeRank(right.rule.match) - scopeRank(left.rule.match),
  );
  return candidates.map(({ rule }) => rule);
}

export function automaticScope(
  layers: Layers,
  model: ModelIdentity | undefined,
  pending: ScopeRule[] = [],
): Selector | undefined {
  if (!model) {
    return undefined;
  }
  return { ...commandScopeRules(layers, model, pending)[0]?.match };
}

export function commandScope(
  layers: Layers,
  model: ModelIdentity | undefined,
  scope?: ScopeName,
  pending: ScopeRule[] = [],
): Selector {
  const match = scope === undefined ? automaticScope(layers, model, pending) : explicitScope(scope, model);
  if (!match) {
    throw new Error("No model selected; use --scope all.");
  }
  return match;
}
