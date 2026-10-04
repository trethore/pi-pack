import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentDir, type ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { parse, printParseErrorCode, type ParseError } from "jsonc-parser";

interface ConfigLoaderOptions<T> {
  name: string;
  knownKeys: readonly (keyof T & string)[];
  defaults: () => T;
  validate: (value: Record<string, unknown>) => T;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ConfigWarningOptions {
  ui?: Pick<ExtensionUIContext, "notify">;
  onWarning?: (message: string) => void;
}

interface ConfigLoadOptions extends ConfigWarningOptions {
  agentDir?: string;
}

export function createWarningReporter({ ui, onWarning }: ConfigWarningOptions): (message: string) => void {
  return onWarning ?? ((message) => ui?.notify(message, "warning"));
}

interface ConfigWarnings {
  knownKeys: readonly string[];
  onWarning?: (message: string) => void;
}

export function parseConfig(source: string, warnings?: ConfigWarnings): Record<string, unknown> {
  const errors: ParseError[] = [];
  const value: unknown = parse(source, errors, { allowTrailingComma: true });
  const firstError = errors[0];
  if (firstError) {
    throw new Error(`${printParseErrorCode(firstError.error)} at offset ${firstError.offset}`);
  }
  if (!isObject(value)) {
    throw new Error("Expected a configuration object");
  }
  if (warnings?.onWarning) {
    const unknownKeys = Object.keys(value).filter((key) => !warnings.knownKeys.includes(key));
    if (unknownKeys.length > 0) {
      warnings.onWarning(`Unknown configuration entries: ${unknownKeys.map((key) => JSON.stringify(key)).join(", ")}.`);
    }
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createConfigLoader<T>({ name, knownKeys, defaults, validate }: ConfigLoaderOptions<T>) {
  return async function loadConfig(
    cwd: string,
    { agentDir = getAgentDir(), ...warnings }: ConfigLoadOptions = {},
  ): Promise<T> {
    const onWarning = createWarningReporter(warnings);
    const locations = [join(cwd, ".pi", `${name}.jsonc`), join(agentDir, `${name}.jsonc`)];
    for (const file of locations) {
      let source: string;
      try {
        source = await readFile(file, "utf8");
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
          continue;
        }
        throw new Error(`${name}: could not read ${file}: ${errorMessage(error)}`, { cause: error });
      }
      try {
        return validate(
          parseConfig(source, {
            knownKeys,
            onWarning: (message) => onWarning(`${name}: ${file}: ${message}`),
          }),
        );
      } catch (error) {
        throw new Error(`${name}: invalid configuration in ${file}: ${errorMessage(error)}`, { cause: error });
      }
    }
    return defaults();
  };
}
