import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSyntheticSourceInfo, type SlashCommandInfo } from "@earendil-works/pi-coding-agent";
import { afterEach, beforeEach, vi } from "vitest";
import { Scope } from "#src/constants";
import { clearWorkspaces, getWorkspace } from "#src/workspace";

export function useWorkspace() {
  const workspace = {
    root: "",
    cwd: "",
    agentDir: "",
    directory(scope: Scope) {
      return scope === Scope.GLOBAL ? workspace.agentDir : join(workspace.cwd, ".pi");
    },
    async script(name: string, source: string, scope: Scope = Scope.PROJECT, extension = "mjs") {
      const path = join(workspace.directory(scope), "script-templates", `${name}.${extension}`);
      await writeFile(path, source);
      return path;
    },
    async configure(value: unknown, scope: Scope = Scope.PROJECT) {
      await writeFile(
        join(workspace.directory(scope), "pi-script-templates.jsonc"),
        typeof value === "string" ? value : JSON.stringify(value),
      );
    },
    async prompt(name: string, source: string, scope: Scope = Scope.GLOBAL): Promise<SlashCommandInfo> {
      const directory = join(workspace.directory(scope), "prompts");
      await mkdir(directory, { recursive: true });
      const path = join(directory, `${name}.md`);
      await writeFile(path, source);
      return {
        name,
        source: "prompt",
        sourceInfo: createSyntheticSourceInfo(path, {
          source: "local",
          scope: scope === Scope.GLOBAL ? "user" : "project",
        }),
      };
    },
    load(trusted = true) {
      return getWorkspace(workspace.cwd, workspace.agentDir, trusted);
    },
    async runs() {
      return readFile(join(workspace.cwd, "runs"), "utf8").catch(() => "");
    },
  };
  beforeEach(async () => {
    clearWorkspaces();
    workspace.root = await mkdtemp(join(tmpdir(), "script-templates-"));
    workspace.cwd = join(workspace.root, "project");
    workspace.agentDir = join(workspace.root, "agent");
    await Promise.all(
      ([Scope.PROJECT, Scope.GLOBAL] as const).map((scope) =>
        mkdir(join(workspace.directory(scope), "script-templates"), { recursive: true }),
      ),
    );
    vi.stubEnv("PI_CODING_AGENT_DIR", workspace.agentDir);
  });
  afterEach(async () => {
    clearWorkspaces();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(workspace.root, { recursive: true, force: true });
  });
  return workspace;
}

export function countingScript(output: string): string {
  return `import { appendFileSync } from 'node:fs';
appendFileSync('runs', 'x');
process.stdout.write(${JSON.stringify(output)});`;
}
