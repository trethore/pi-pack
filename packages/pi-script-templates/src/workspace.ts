import { resolve } from "node:path";
import { loadConfig, type ScriptTemplatesConfig } from "#src/config";
import { discoverScripts } from "#src/scripts/discovery";
import { ScriptTemplates } from "#src/scripts/templates";

export interface Workspace {
  config: ScriptTemplatesConfig | undefined;
  templates: ScriptTemplates | undefined;
  prompts: Map<string, Promise<string | undefined>>;
  warnings: string[];
}

const cacheKey = Symbol.for("pi-pack.pi-script-templates.workspaces.v1");
const host: typeof globalThis & { [cacheKey]?: Map<string, Promise<Workspace>> } = globalThis;
// Pi recreates extension modules when replacing workspace runtimes, not only on /reload.
const workspaces = (host[cacheKey] ??= new Map<string, Promise<Workspace>>());

export function clearWorkspaces(): void {
  workspaces.clear();
}

async function loadWorkspace(cwd: string, agentDir: string, projectTrusted: boolean): Promise<Workspace> {
  const warnings: string[] = [];
  const warn = (message: string) => warnings.push(`pi-script-templates: ${message}`);
  const config = await loadConfig(cwd, agentDir, projectTrusted, warn);
  const scripts = config?.enabled ? await discoverScripts(cwd, agentDir, projectTrusted, warn) : undefined;
  return {
    config,
    templates: scripts && config ? new ScriptTemplates(cwd, scripts, config.execution, warn) : undefined,
    prompts: new Map(),
    warnings,
  };
}

export function getWorkspace(cwd: string, agentDir: string, projectTrusted: boolean): Promise<Workspace> {
  const key = JSON.stringify([resolve(cwd), resolve(agentDir), projectTrusted]);
  let workspace = workspaces.get(key);
  if (!workspace) {
    workspace = loadWorkspace(cwd, agentDir, projectTrusted);
    workspaces.set(key, workspace);
  }
  return workspace;
}
