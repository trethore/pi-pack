import { randomUUID } from "node:crypto";
import { chmod, mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  configPaths as sharedConfigPaths,
  createWarningReporter,
  type ConfigWarningOptions,
} from "@pi-pack/shared/config";
import { readOptionalFile } from "@pi-pack/shared/files";
import { Destination, extensionName } from "#src/constants";
import { readEnvironment, type Layers } from "#src/config/settings";
import type { ScopePatch } from "#src/config/changes";
import { parseSource, patchSource } from "#src/config/document";

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

export async function defaultDestination(
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
  patches: ScopePatch[],
  { projectTrusted }: ProjectTrustOptions,
): Promise<void> {
  if (destination === Destination.PROJECT && !projectTrusted) {
    throw new Error("Project is not trusted; refusing to save project configuration.");
  }
  if (patches.length === 0) {
    return;
  }
  const file = paths[destination];
  const existing = await readSource(file, destination);
  const configuration = existing === undefined ? {} : parseSource(existing, destination);
  const original = existing ?? "{}\n";
  const source = patchSource(original, configuration, patches);
  if (source === original) {
    return;
  }
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const mode = existing === undefined ? 0o600 : (await stat(file)).mode & 0o777;
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporary, source, { flag: "wx", mode });
    if (existing !== undefined) {
      // File creation applies umask; restore the existing permissions before replacement.
      await chmod(temporary, mode);
    }
    await rename(temporary, file);
  } catch {
    throw new Error(`Could not save ${destination} configuration.`);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}
