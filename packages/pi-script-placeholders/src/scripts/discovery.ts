import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Scope } from "#src/constants";
import type { Script } from "#src/scripts/execution";

function isMissing(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function readScripts(directory: string, scope: Script["scope"], warn: (message: string) => void) {
  const scripts = new Map<string, Script[]>();
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const match = /^([a-zA-Z0-9_-]+)\.(?:mjs|js)$/.exec(entry.name);
      const name = match?.[1];
      if (name === undefined || (!entry.isFile() && !entry.isSymbolicLink())) {
        continue;
      }
      const candidates = scripts.get(name) ?? [];
      candidates.push({ name, scope, path: join(directory, entry.name) });
      scripts.set(name, candidates);
    }
  } catch (error) {
    if (!isMissing(error)) {
      warn(`Could not read ${scope} script-placeholders directory.`);
    }
  }
  return scripts;
}

export async function discoverScripts(
  cwd: string,
  agentDir: string,
  projectTrusted: boolean,
  warn: (message: string) => void,
): Promise<Map<string, Script | undefined>> {
  const [global, project] = await Promise.all([
    readScripts(join(agentDir, "script-placeholders"), Scope.GLOBAL, warn),
    projectTrusted
      ? readScripts(join(cwd, ".pi", "script-placeholders"), Scope.PROJECT, warn)
      : new Map<string, Script[]>(),
  ]);
  const scripts = new Map<string, Script | undefined>();
  for (const name of new Set([...global.keys(), ...project.keys()])) {
    if (global.has(name) && project.has(name)) {
      warn(`"${name}" exists globally and in the project; using the project script.`);
    }
    const candidates = project.get(name) ?? global.get(name) ?? [];
    const script = candidates[0];
    if (candidates.length > 1 && script) {
      warn(`"${name}" has both .js and .mjs scripts in ${script.scope} scope; placeholder left unchanged.`);
      scripts.set(name, undefined);
    } else {
      scripts.set(name, script);
    }
  }
  return scripts;
}
