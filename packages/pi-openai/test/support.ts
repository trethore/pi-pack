import type { Destination } from "#src/constants";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPaths } from "#src/config";
import { defaults, type Layers, type Settings } from "#src/settings";
import type { RequestModel } from "#src/compatibility";

export const model: RequestModel = {
  id: "gpt-6-sol",
  provider: "openai",
  api: "openai-responses",
  baseUrl: "https://api.openai.com/v1",
  reasoning: true,
};

export function settings(overrides: Partial<Settings> = {}): Settings {
  return { ...defaults, ...overrides };
}

export function layers(overrides: Partial<Layers> = {}): Layers {
  return { global: {}, project: {}, environment: {}, command: {}, ...overrides };
}

export async function createWorkspace() {
  const root = await mkdtemp(join(tmpdir(), "pi-openai-"));
  const cwd = join(root, "project");
  const agentDir = join(root, "agent");
  await Promise.all([mkdir(join(cwd, ".pi"), { recursive: true }), mkdir(agentDir)]);
  const paths = configPaths(cwd, agentDir);
  return {
    root,
    cwd,
    agentDir,
    paths,
    write(destination: Destination, source: string) {
      return writeFile(paths[destination], source);
    },
    read(destination: Destination) {
      return readFile(paths[destination], "utf8");
    },
    dispose() {
      return rm(root, { recursive: true, force: true });
    },
  };
}
