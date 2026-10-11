import { isRecord, isArray, isString } from "#src/sandbox/values";

export interface ToolDefinition {
  name: string;
  jsName: string;
  description: string;
}

export interface GlobalDefinition {
  name: string;
  spread: boolean;
}

export interface BootstrapData {
  /** `jsName` is the identifier the script uses; `description` is listed in `ALL_TOOLS`. */
  tools: ToolDefinition[];
  globals: GlobalDefinition[];
  /** Snapshot for `load()`: key to JSON text. */
  store: Record<string, string>;
}

function isArrayOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  if (!isArray(value)) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !isItem(value[index])) {
      return false;
    }
  }

  return true;
}

function isToolDefinition(value: unknown): value is ToolDefinition {
  return isRecord(value) && isString(value.name) && isString(value.jsName) && isString(value.description);
}

export function isToolDefinitions(value: unknown): value is ToolDefinition[] {
  return isArrayOf(value, isToolDefinition);
}

function isGlobalDefinition(value: unknown): value is GlobalDefinition {
  return isRecord(value) && isString(value.name) && typeof value.spread === "boolean";
}

export function isGlobalDefinitions(value: unknown): value is GlobalDefinition[] {
  return isArrayOf(value, isGlobalDefinition);
}

export function isStoreSnapshot(value: unknown): value is BootstrapData["store"] {
  return isRecord(value) && Object.values(value).every(isString);
}
