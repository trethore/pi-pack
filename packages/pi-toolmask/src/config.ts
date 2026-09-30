import { readFile } from "node:fs/promises";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

export interface ToolmaskConfig {
  enabled: boolean;
  enforceBeforeAgentStart: boolean;
  masks: string[];
}

export const disabledConfig: ToolmaskConfig = {
  enabled: false,
  enforceBeforeAgentStart: false,
  masks: [],
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function booleanOption(value: unknown, name: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") throw new Error(`${name} must be a boolean`);
  return value;
}

function parseMasks(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error("masks must be an array of strings");
  const values: unknown[] = value;
  const masks: string[] = [];
  for (const mask of values) {
    if (typeof mask !== "string" || mask.length === 0 || mask === "!") {
      throw new Error("Each mask must be a nonempty string with a pattern after !");
    }
    masks.push(mask);
  }
  return masks;
}

function parseConfig(source: string): ToolmaskConfig {
  const errors: ParseError[] = [];
  const value: unknown = parse(source, errors, { allowTrailingComma: true });
  const firstError = errors[0];
  if (firstError) {
    throw new Error(`${printParseErrorCode(firstError.error)} at offset ${firstError.offset}`);
  }
  if (!isObject(value)) throw new Error("Expected a configuration object");
  return {
    enabled: booleanOption(value.enabled, "enabled", true),
    enforceBeforeAgentStart: booleanOption(value.enforceBeforeAgentStart, "enforceBeforeAgentStart", false),
    masks: parseMasks(value.masks),
  };
}

async function readConfig(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

export async function loadConfig(cwd: string, agentDir = getAgentDir()): Promise<ToolmaskConfig> {
  for (const file of [path.join(cwd, ".pi", "pi-toolmask.jsonc"), path.join(agentDir, "pi-toolmask.jsonc")]) {
    try {
      const source = await readConfig(file);
      if (source !== undefined) {
        return parseConfig(source);
      }
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`pi-toolmask: could not load ${file}: ${reason}`, { cause: error });
    }
  }
  return disabledConfig;
}
