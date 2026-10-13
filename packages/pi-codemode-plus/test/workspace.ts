import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, vi } from "vitest";

export function useWorkspace() {
  const workspace = {
    cwd: "",
    agentDir: "",
    async configure(source: string, global = false) {
      const directory = global ? workspace.agentDir : join(workspace.cwd, ".pi");
      await writeFile(join(directory, "pi-codemode-plus.jsonc"), source);
    },
  };
  let root: string;
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "codemode-plus-"));
    workspace.cwd = join(root, "project");
    workspace.agentDir = join(root, "agent");
    await mkdir(join(workspace.cwd, ".pi"), { recursive: true });
    await mkdir(workspace.agentDir);
    vi.stubEnv("PI_CODING_AGENT_DIR", workspace.agentDir);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(root, { recursive: true, force: true });
  });
  return workspace;
}
