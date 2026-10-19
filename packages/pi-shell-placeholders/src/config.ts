import { isAbsolute } from "node:path";
import {
  createConfigLoader,
  createWarningReporter,
  warnUnknownConfig,
  type ConfigLoadOptions,
} from "@pi-pack/shared/config";
import { booleanOption, isObject } from "@pi-pack/shared/validation";
import { EXTENSION_NAME } from "#src/constants";

export interface ExecutionConfig {
  shell: string;
  timeoutMs: number;
  maxOutputChars: number;
}

export interface ShellConfig {
  enabled: boolean;
  surfaces: { system: boolean; appendSystem: boolean; promptTemplates: boolean };
  execution: ExecutionConfig;
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
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function executionOptions(value: Record<string, unknown>): ExecutionConfig {
  const shell = value.shell === undefined ? "/bin/sh" : value.shell;
  if (typeof shell !== "string" || !isAbsolute(shell) || shell.includes("\0")) {
    throw new Error("execution.shell must be an absolute shell path");
  }
  const timeoutMs = positiveInteger(value.timeoutMs, "execution.timeoutMs", 3000);
  if (timeoutMs > 2_147_483_647) {
    throw new Error("execution.timeoutMs must not exceed 2147483647");
  }
  return { shell, timeoutMs, maxOutputChars: positiveInteger(value.maxOutputChars, "execution.maxOutputChars", 1000) };
}

export function loadConfig(cwd: string, options: ConfigLoadOptions): Promise<ShellConfig> {
  const warn = createWarningReporter(options);
  const validate = (value: Record<string, unknown>): ShellConfig => {
    const surfaces = objectOption(value.surfaces, "surfaces");
    const execution = objectOption(value.execution, "execution");
    warnUnknownConfig(surfaces, ["system", "appendSystem", "promptTemplates"], (message) =>
      warn(`${EXTENSION_NAME}: surfaces: ${message}`),
    );
    warnUnknownConfig(execution, ["shell", "timeoutMs", "maxOutputChars"], (message) =>
      warn(`${EXTENSION_NAME}: execution: ${message}`),
    );
    return {
      enabled: booleanOption(value.enabled, "enabled", true),
      surfaces: {
        system: booleanOption(surfaces.system, "surfaces.system", true),
        appendSystem: booleanOption(surfaces.appendSystem, "surfaces.appendSystem", true),
        promptTemplates: booleanOption(surfaces.promptTemplates, "surfaces.promptTemplates", true),
      },
      execution: executionOptions(execution),
    };
  };
  const load = createConfigLoader({
    name: EXTENSION_NAME,
    knownKeys: ["enabled", "surfaces", "execution"],
    defaults: () => validate({}),
    validate,
  });
  return load(cwd, options);
}
