import { parseConfig } from "@pi-pack/shared/config";
import { isObject } from "@pi-pack/shared/validation";
import { applyEdits, createScanner, findNodeAtLocation, modify, parseTree, type Node } from "jsonc-parser";
import type { ScopePatch } from "#src/config/changes";
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

function commaAt(source: string, offset: number): number | undefined {
  const scanner = createScanner(source, true);
  scanner.setPosition(offset);
  scanner.scan();
  const tokenOffset = scanner.getTokenOffset();
  return source[tokenOffset] === "," ? tokenOffset : undefined;
}

function remove(source: string, path: (string | number)[]): string {
  const root = parseTree(source);
  const value = root && findNodeAtLocation(root, path);
  if (!value) {
    return source;
  }
  const node = value.parent?.type === "property" ? value.parent : value;
  const siblings = node.parent?.children ?? [];
  const previous = siblings[siblings.indexOf(node) - 1];
  const comma =
    commaAt(source, node.offset + node.length) ??
    (previous ? commaAt(source, previous.offset + previous.length) : undefined);
  // jsonc-parser's property removal can also remove comments belonging to the next entry.
  const edits = [{ offset: node.offset, length: node.length, content: "" }];
  if (comma !== undefined) {
    edits.push({ offset: comma, length: 1, content: "" });
  }
  return applyEdits(source, edits);
}

function edit(source: string, path: (string | number)[], value: unknown): string {
  if (value === undefined) {
    return remove(source, path);
  }
  return applyEdits(
    source,
    modify(source, path, value, {
      formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes("\r\n") ? "\r\n" : "\n" },
    }),
  );
}

function patchSettings(source: string, path: (string | number)[], patch: ScopePatch): string {
  for (const key of settingNames.filter((setting) => Object.hasOwn(patch.settings, setting))) {
    source = edit(source, [...path, key], patch.settings[key]);
  }
  for (const key of patch.unset ?? []) {
    source = edit(source, [...path, key], undefined);
  }
  return source;
}

function pruneRule(source: string, rules: ScopeRule[], index: number): string {
  const node = property(parseTree(source), "overrides")?.children?.[index];
  if (property(node, "settings")?.children?.length !== 0) {
    return source;
  }
  const hasUnknownFields = node?.children?.some((child) => {
    const name: unknown = child.children?.[0]?.value;
    return name !== "match" && name !== "settings";
  });
  if (hasUnknownFields) {
    return source;
  }
  source = edit(source, ["overrides", index], undefined);
  rules.splice(index, 1);
  return rules.length === 0 ? edit(source, ["overrides"], undefined) : source;
}

function patchRule(source: string, rules: ScopeRule[], patch: ScopePatch): string {
  if (scopeSize(patch.match) === 0) {
    return patchSettings(source, [], patch);
  }
  let index = rules.findIndex((rule) => scopeId(rule.match) === scopeId(patch.match));
  if (index === -1) {
    if (Object.keys(patch.settings).length === 0) {
      return source;
    }
    index = rules.length;
    rules.push(patch);
    source = edit(source, ["overrides", index], { match: patch.match, settings: {} });
  }
  source = patchSettings(source, ["overrides", index, "settings"], patch);
  return patch.unset?.length ? pruneRule(source, rules, index) : source;
}

export function patchSource(source: string, configuration: ScopedSettings, patches: ScopePatch[]): string {
  const rules = [...(configuration.overrides ?? [])];
  for (const patch of patches) {
    source = patchRule(source, rules, patch);
  }
  return source;
}
