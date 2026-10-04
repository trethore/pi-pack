import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { parseConfig } from "@pi-pack/shared/config";
import { applyEdits, modify, parseTree } from "jsonc-parser";
import { Destination, extensionName } from "#src/constants";
import { isSetting, readEnvironment, settingNames, validateSettings, type Layers, type Settings } from "#src/settings";

export { Destination } from "#src/constants";

const configFileName = `${extensionName}.jsonc`;

export type ConfigPaths = Record<Destination, string>;

export function configPaths(cwd: string, agentDir = getAgentDir()): ConfigPaths {
  return {
    global: join(agentDir, configFileName),
    project: join(cwd, ".pi", configFileName),
  };
}

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readSource(file: string, destination: Destination): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw new Error(`Could not read ${destination} configuration.`, { cause: error });
  }
}

function rejectDuplicateSettings(source: string): void {
  const seen = new Set<string>();
  const properties = parseTree(source)?.children ?? [];
  for (const property of properties) {
    const key: unknown = property.children?.[0]?.value;
    if (typeof key !== "string" || !isSetting(key)) continue;
    // JSONC edits target the first property, but parsing uses the last duplicate.
    if (seen.has(key)) throw new Error(`Duplicate setting: ${key}`);
    seen.add(key);
  }
}

function parseSource(source: string, destination: Destination): Partial<Settings> {
  try {
    const settings = validateSettings(parseConfig(source));
    rejectDuplicateSettings(source);
    return settings;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid configuration";
    throw new Error(`Invalid ${destination} configuration: ${message}`, { cause: error });
  }
}

export async function loadConfiguration(paths: ConfigPaths, environment = process.env): Promise<Layers> {
  const [global, project] = await Promise.all([
    readSource(paths.global, Destination.GLOBAL),
    readSource(paths.project, Destination.PROJECT),
  ]);
  return {
    global: global === undefined ? {} : parseSource(global, Destination.GLOBAL),
    project: project === undefined ? {} : parseSource(project, Destination.PROJECT),
    environment: readEnvironment(environment),
    command: {},
  };
}

export async function saveDestination(paths: ConfigPaths): Promise<Destination> {
  try {
    await stat(paths.project);
    return Destination.PROJECT;
  } catch (error) {
    if (isMissing(error)) return Destination.GLOBAL;
    throw new Error("Could not inspect project configuration.", { cause: error });
  }
}

export async function saveConfiguration(
  paths: ConfigPaths,
  destination: Destination,
  settings: Settings,
): Promise<void> {
  const file = paths[destination];
  const existing = await readSource(file, destination);
  if (existing !== undefined) parseSource(existing, destination);
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
