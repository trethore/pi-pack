import { configPaths, parseConfig } from "@pi-pack/shared/config";
import { readOptionalFile } from "@pi-pack/shared/files";
import { booleanOption, isObject } from "@pi-pack/shared/validation";
import { Scope } from "#src/constants";

const ConfigKey = {
  Enabled: "enabled",
  Surfaces: "surfaces",
  Execution: "execution",
} as const;

const SurfaceKey = {
  System: "system",
  AppendSystem: "appendSystem",
  PromptTemplates: "promptTemplates",
} as const;

const ExecutionKey = {
  TimeoutMs: "timeoutMs",
  MaxOutputChars: "maxOutputChars",
} as const;

export interface ScriptPlaceholdersConfig {
  [ConfigKey.Enabled]: boolean;
  [ConfigKey.Surfaces]: {
    [SurfaceKey.System]: boolean;
    [SurfaceKey.AppendSystem]: boolean;
    [SurfaceKey.PromptTemplates]: boolean;
  };
  [ConfigKey.Execution]: {
    [ExecutionKey.TimeoutMs]: number;
    [ExecutionKey.MaxOutputChars]: number;
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

function validate(value: Record<string, unknown>, warn: (message: string) => void): ScriptPlaceholdersConfig {
  const surfaces = objectOption(value[ConfigKey.Surfaces], ConfigKey.Surfaces);
  const execution = objectOption(value[ConfigKey.Execution], ConfigKey.Execution);
  warnUnknown(value, Object.values(ConfigKey), "configuration", warn);
  warnUnknown(surfaces, Object.values(SurfaceKey), ConfigKey.Surfaces, warn);
  warnUnknown(execution, Object.values(ExecutionKey), ConfigKey.Execution, warn);
  return {
    [ConfigKey.Enabled]: booleanOption(value[ConfigKey.Enabled], ConfigKey.Enabled, true),
    [ConfigKey.Surfaces]: {
      [SurfaceKey.System]: booleanOption(
        surfaces[SurfaceKey.System],
        `${ConfigKey.Surfaces}.${SurfaceKey.System}`,
        true,
      ),
      [SurfaceKey.AppendSystem]: booleanOption(
        surfaces[SurfaceKey.AppendSystem],
        `${ConfigKey.Surfaces}.${SurfaceKey.AppendSystem}`,
        true,
      ),
      [SurfaceKey.PromptTemplates]: booleanOption(
        surfaces[SurfaceKey.PromptTemplates],
        `${ConfigKey.Surfaces}.${SurfaceKey.PromptTemplates}`,
        true,
      ),
    },
    [ConfigKey.Execution]: {
      [ExecutionKey.TimeoutMs]: positiveInteger(
        execution[ExecutionKey.TimeoutMs],
        `${ConfigKey.Execution}.${ExecutionKey.TimeoutMs}`,
        3000,
      ),
      [ExecutionKey.MaxOutputChars]: positiveInteger(
        execution[ExecutionKey.MaxOutputChars],
        `${ConfigKey.Execution}.${ExecutionKey.MaxOutputChars}`,
        1000,
      ),
    },
  };
}

export async function loadConfig(
  cwd: string,
  agentDir: string,
  projectTrusted: boolean,
  warn: (message: string) => void,
): Promise<ScriptPlaceholdersConfig | undefined> {
  const paths = configPaths("pi-script-placeholders", cwd, agentDir);
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
