import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  configPaths as sharedConfigPaths,
  createWarningReporter,
  parseConfig,
  type ConfigWarningOptions,
} from "@pi-pack/shared/config";
import { readOptionalFile } from "@pi-pack/shared/files";
import { applyEdits, modify, parseTree } from "jsonc-parser";
import { Destination, extensionName } from "#src/constants";
import {
  isSetting,
  readEnvironment,
  settingNames,
  validateSettings,
  type Layers,
  type Settings,
} from "#src/config/settings";

export { Destination } from "#src/constants";

export type ConfigPaths = Record<Destination, string>;

export function configPaths(cwd: string, agentDir?: string): ConfigPaths {
  return sharedConfigPaths(extensionName, cwd, agentDir);
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readSource(file: string, destination: Destination): Promise<string | undefined> {
  try {
    return await readOptionalFile(file);
  } catch (error) {
    throw new Error(`Could not read ${destination} configuration.`, { cause: error });
  }
}

function rejectDuplicateSettings(source: string): void {
  const seen = new Set<string>();
  const properties = parseTree(source)?.children ?? [];
  for (const property of properties) {
    const key: unknown = property.children?.[0]?.value;
    if (typeof key !== "string" || !isSetting(key)) {
      continue;
    }
    // JSONC edits target the first property, but parsing uses the last duplicate.
    if (seen.has(key)) {
      throw new Error(`Duplicate setting: ${key}`);
    }
    seen.add(key);
  }
}

function parseSource(
  source: string,
  destination: Destination,
  onWarning?: (message: string) => void,
): Partial<Settings> {
  try {
    const settings = validateSettings(
      parseConfig(source, {
        knownKeys: settingNames,
        onWarning: (message) => onWarning?.(`${extensionName}: ${destination} configuration: ${message}`),
      }),
    );
    rejectDuplicateSettings(source);
    return settings;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid configuration";
    throw new Error(`Invalid ${destination} configuration: ${message}`, { cause: error });
  }
}

interface ProjectTrustOptions {
  projectTrusted: boolean;
}

interface LoadConfigurationOptions extends ConfigWarningOptions, ProjectTrustOptions {
  environment?: NodeJS.ProcessEnv;
}

export async function loadConfiguration(
  paths: ConfigPaths,
  { projectTrusted, environment = process.env, ...warnings }: LoadConfigurationOptions,
): Promise<Layers> {
  const onWarning = createWarningReporter(warnings);
  const [global, project] = await Promise.all([
    readSource(paths.global, Destination.GLOBAL),
    projectTrusted ? readSource(paths.project, Destination.PROJECT) : undefined,
  ]);
  return {
    global: global === undefined ? {} : parseSource(global, Destination.GLOBAL, onWarning),
    project: project === undefined ? {} : parseSource(project, Destination.PROJECT, onWarning),
    environment: readEnvironment(environment),
    command: {},
  };
}

export async function saveDestination(
  paths: ConfigPaths,
  { projectTrusted }: ProjectTrustOptions,
): Promise<Destination> {
  if (!projectTrusted) {
    return Destination.GLOBAL;
  }
  try {
    await stat(paths.project);
    return Destination.PROJECT;
  } catch (error) {
    if (isMissing(error)) {
      return Destination.GLOBAL;
    }
    throw new Error("Could not inspect project configuration.", { cause: error });
  }
}

export async function saveConfiguration(
  paths: ConfigPaths,
  destination: Destination,
  settings: Settings,
  { projectTrusted }: ProjectTrustOptions,
): Promise<void> {
  if (destination === Destination.PROJECT && !projectTrusted) {
    throw new Error("Project is not trusted; refusing to save project configuration.");
  }
  const file = paths[destination];
  const existing = await readSource(file, destination);
  if (existing !== undefined) {
    parseSource(existing, destination);
  }
  let source = existing ?? "{}\n";
  for (const key of settingNames) {
    source = applyEdits(
      source,
      modify(source, [key], settings[key], {
        formattingOptions: { insertSpaces: true, tabSize: 2, eol: source.includes("\r\n") ? "\r\n" : "\n" },
      }),
    );
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const mode = existing === undefined ? 0o600 : (await stat(file)).mode & 0o777;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporary, source, { flag: "wx", mode });
    await rename(temporary, file);
  } catch {
    throw new Error(`Could not save ${destination} configuration.`);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
