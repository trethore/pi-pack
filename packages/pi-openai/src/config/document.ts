import { parseConfig } from "@pi-pack/shared/config";
import { isObject } from "@pi-pack/shared/validation";
import { applyEdits, modify, parseTree, type Node } from "jsonc-parser";
import { extensionName, type Destination } from "#src/constants";
import { settingNames, validateSettings } from "#src/config/settings";
import { scopeId, scopeSize, validateSelector, type ScopeRule, type ScopedSettings } from "#src/config/scopes";

function property(node: Node | undefined, name: string): Node | undefined {
  return node?.children?.find((child) => child.children?.[0]?.value === name)?.children?.[1];
}

function rejectDuplicates(node: Node | undefined, keys: readonly string[]): void {
  const seen = new Set<string>();
  for (const child of node?.children ?? []) {
    const key: unknown = child.children?.[0]?.value;
    if (typeof key !== "string" || !keys.includes(key)) {
      continue;
    }
    // Parsing uses the last duplicate, whereas JSONC edits target the first.
    if (seen.has(key)) {
      throw new Error(`Duplicate setting: ${key}`);
    }
    seen.add(key);
  }
}

function checkDuplicates(source: string): void {
  const root = parseTree(source);
  rejectDuplicates(root, [...settingNames, "overrides"]);
  for (const rule of property(root, "overrides")?.children ?? []) {
    rejectDuplicates(rule, ["match", "settings"]);
    rejectDuplicates(property(rule, "match"), ["provider", "model", "api"]);
    rejectDuplicates(property(rule, "settings"), settingNames);
  }
}

function warnUnknown(
  input: Record<string, unknown>,
  knownKeys: readonly string[],
  warn: (message: string) => void,
): void {
  const unknown = Object.keys(input).filter((key) => !knownKeys.includes(key));
  if (unknown.length > 0) {
    warn(`Unknown configuration entries: ${unknown.map((key) => JSON.stringify(key)).join(", ")}.`);
  }
}

function validateRule(input: unknown, warn: (message: string) => void): ScopeRule {
  if (!isObject(input) || !isObject(input.settings)) {
    throw new Error("Expected an override object with match and settings objects");
  }
  const match = validateSelector(input.match);
  warnUnknown(input, ["match", "settings"], warn);
  warnUnknown(input.settings, settingNames, warn);
  return { match, settings: validateSettings(input.settings) };
}

function validateRules(input: unknown, warn: (message: string) => void): ScopeRule[] {
  if (!Array.isArray(input)) {
    throw new Error("overrides must be an array");
  }
  const seen = new Set<string>();
  return input.map((entry: unknown, index) => {
    try {
      const rule = validateRule(entry, (message) => warn(`overrides[${index}]: ${message}`));
      const id = scopeId(rule.match);
      if (seen.has(id)) {
        throw new Error("Duplicate selector");
      }
      seen.add(id);
      return rule;
    } catch (error) {
      throw new Error(`overrides[${index}]: ${error instanceof Error ? error.message : "Invalid override"}`, {
        cause: error,
      });
    }
  });
}

export function parseSource(
  source: string,
  destination: Destination,
  onWarning?: (message: string) => void,
): ScopedSettings {
  try {
    const warn = (message: string) => onWarning?.(`${extensionName}: ${destination} configuration: ${message}`);
    const input = parseConfig(source, { knownKeys: [...settingNames, "overrides"], onWarning: warn });
    checkDuplicates(source);
    const settings: ScopedSettings = validateSettings(input);
    if (Object.hasOwn(input, "overrides")) {
      settings.overrides = validateRules(input.overrides, warn);
    }
    return settings;
  } catch (error) {
    throw new Error(
      `Invalid ${destination} configuration: ${error instanceof Error ? error.message : "Invalid configuration"}`,
      { cause: error },
    );
  }
}

function edit(source: string, path: (string | number)[], value: unknown): string {
  return applyEdits(
    source,
    modify(source, path, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes("\r\n") ? "\r\n" : "\n" },
    }),
  );
}

export function patchSource(source: string, configuration: ScopedSettings, patches: ScopeRule[]): string {
  const rules = [...(configuration.overrides ?? [])];
  for (const patch of patches) {
    let path: (string | number)[] = [];
    if (scopeSize(patch.match) > 0) {
      let index = rules.findIndex((rule) => scopeId(rule.match) === scopeId(patch.match));
      if (index === -1) {
        index = rules.length;
        rules.push(patch);
        source = edit(source, ["overrides", index], { match: patch.match, settings: {} });
      }
      path = ["overrides", index, "settings"];
    }
    for (const key of settingNames.filter((setting) => Object.hasOwn(patch.settings, setting))) {
      source = edit(source, [...path, key], patch.settings[key]);
    }
  }
  return source;
}
