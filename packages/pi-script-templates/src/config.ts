import { configPaths, parseConfig } from "@pi-pack/shared/config";
import { readOptionalFile } from "@pi-pack/shared/files";
import { booleanOption, isObject } from "@pi-pack/shared/validation";
import { Scope } from "#src/constants";

export interface ScriptTemplatesConfig {
  enabled: boolean;
  surfaces: {
    system: boolean;
    appendSystem: boolean;
    promptTemplates: boolean;
  };
  execution: {
    timeoutMs: number;
    maxOutputChars: number;
  };
}

function objectOption(value: unknown, name: string): Record<string, unknown> {
  if (value === undefined) {
    return {};
  }
  if (!isObject(value)) {
    throw new Error(`${name} must be an object`);
  }
  return value;
}

function positiveInteger(value: unknown, name: string, fallback: number): number {
  if (value === undefined) {
    return fallback;
  }
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 2147483647) {
    throw new Error(`${name} must be an integer between 1 and 2147483647`);
  }
  return value;
}

function warnUnknown(value: Record<string, unknown>, keys: string[], section: string, warn: (message: string) => void) {
  if (Object.keys(value).some((key) => !keys.includes(key))) {
    warn(`Unknown entries in ${section}.`);
  }
}

function validate(value: Record<string, unknown>, warn: (message: string) => void): ScriptTemplatesConfig {
  const surfaces = objectOption(value.surfaces, "surfaces");
  const execution = objectOption(value.execution, "execution");
  warnUnknown(value, ["enabled", "surfaces", "execution"], "configuration", warn);
  warnUnknown(surfaces, ["system", "appendSystem", "promptTemplates"], "surfaces", warn);
  warnUnknown(execution, ["timeoutMs", "maxOutputChars"], "execution", warn);
  return {
    enabled: booleanOption(value.enabled, "enabled", true),
    surfaces: {
      system: booleanOption(surfaces.system, "surfaces.system", true),
      appendSystem: booleanOption(surfaces.appendSystem, "surfaces.appendSystem", true),
      promptTemplates: booleanOption(surfaces.promptTemplates, "surfaces.promptTemplates", true),
    },
    execution: {
      timeoutMs: positiveInteger(execution.timeoutMs, "execution.timeoutMs", 3000),
      maxOutputChars: positiveInteger(execution.maxOutputChars, "execution.maxOutputChars", 1000),
    },
  };
}

export async function loadConfig(
  cwd: string,
  agentDir: string,
  projectTrusted: boolean,
  warn: (message: string) => void,
): Promise<ScriptTemplatesConfig | undefined> {
  const paths = configPaths("pi-script-templates", cwd, agentDir);
  const scopes = projectTrusted ? [Scope.PROJECT, Scope.GLOBAL] : [Scope.GLOBAL];
  for (const scope of scopes) {
    let source: string | undefined;
    try {
      source = await readOptionalFile(paths[scope]);
    } catch {
      warn(`Could not read ${scope} configuration; extension disabled until /reload.`);
      return undefined;
    }
    if (source === undefined) {
      continue;
    }
    try {
      return validate(parseConfig(source), (message) => warn(`${scope} configuration: ${message}`));
    } catch {
      warn(`Invalid ${scope} configuration; extension disabled until /reload.`);
      return undefined;
    }
  }
  return validate({}, warn);
}
