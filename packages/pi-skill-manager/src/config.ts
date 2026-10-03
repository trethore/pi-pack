import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import {
  applyEdits,
  createConfigLoader,
  createScanner,
  findNodeAtLocation,
  modify,
  parseConfig,
  parseTree,
} from "@pi-pack/shared/config";
import { booleanOption } from "@pi-pack/shared/validation";

type SkillRule = [name: string, enabled: boolean];
export type ConfigScope = "project" | "global";

export interface SkillManagerConfig {
  enabled: boolean;
  skills: SkillRule[];
}

export function defaultConfig(): SkillManagerConfig {
  return { enabled: true, skills: [] };
}

function validateRule(value: unknown): SkillRule {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error("each skill rule must be [name, boolean]");
  }
  const tuple: unknown[] = value;
  const name = tuple[0];
  const enabled = tuple[1];
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("skill names must be non-empty strings");
  }
  if (typeof enabled !== "boolean") throw new Error(`status for skill ${name} must be a boolean`);
  return [name, enabled];
}

export function validateConfig(value: Record<string, unknown>): SkillManagerConfig {
  const enabled = booleanOption(value.enabled, "enabled", true);
  const rules = value.skills === undefined ? [] : value.skills;
  if (!Array.isArray(rules)) throw new Error("skills must be an array of [name, boolean] rules");
  const skills = rules.map(validateRule);
  const names = new Set<string>();
  for (const [name] of skills) {
    if (names.has(name)) throw new Error(`duplicate skill rule: ${name}`);
    names.add(name);
  }
  return { enabled, skills };
}

export const loadConfig = createConfigLoader({
  name: "pi-skill-manager",
  defaults: defaultConfig,
  validate: validateConfig,
});

export function configPath(cwd: string, scope: ConfigScope, agentDir = getAgentDir()): string {
  return join(scope === "project" ? join(cwd, ".pi") : agentDir, "pi-skill-manager.jsonc");
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === code;
}

export async function projectConfigExists(cwd: string): Promise<boolean> {
  try {
    await stat(configPath(cwd, "project"));
    return true;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return false;
    throw error;
  }
}

async function readForSave(file: string): Promise<string> {
  try {
    const source = await readFile(file, "utf8");
    validateConfig(parseConfig(source));
    return source;
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return "{}\n";
    throw error;
  }
}

function removeRule(source: string, index: number): string {
  const root = parseTree(source);
  if (!root) throw new Error("Missing configuration object");
  const node = findNodeAtLocation(root, ["skills", index]);
  if (!node) throw new Error("Missing skill rule");
  const scanner = createScanner(source, true);
  scanner.setPosition(node.offset + node.length);
  scanner.scan();
  const edits = [{ offset: node.offset, length: node.length, content: "" }];
  const token = source.slice(scanner.getTokenOffset(), scanner.getTokenOffset() + scanner.getTokenLength());
  if (token === ",") {
    edits.push({ offset: scanner.getTokenOffset(), length: scanner.getTokenLength(), content: "" });
  }
  return applyEdits(source, edits);
}

function updateSource(source: string, config: SkillManagerConfig): string {
  const original = parseConfig(source);
  const previous = validateConfig(original).skills;
  const desired = new Map(config.skills);
  const formattingOptions = { insertSpaces: true, tabSize: 2, eol: source.includes("\r\n") ? "\r\n" : "\n" };
  const edit = (path: (string | number)[], value: unknown): void => {
    source = applyEdits(source, modify(source, path, value, { formattingOptions }));
  };
  edit(["enabled"], config.enabled);
  if (original.skills === undefined) {
    edit(["skills"], config.skills);
    return source;
  }
  // Edit rule statuses in place so comments on retained entries survive a save.
  for (let index = previous.length - 1; index >= 0; index--) {
    const name = previous[index]?.[0];
    if (name === undefined) continue;
    if (desired.has(name)) edit(["skills", index, 1], desired.get(name));
    else source = removeRule(source, index);
  }
  const previousNames = new Set(previous.map(([name]) => name));
  for (const rule of config.skills) {
    if (!previousNames.has(rule[0])) edit(["skills", -1], rule);
  }
  return source;
}

async function removeTemporary(file: string): Promise<void> {
  try {
    await rm(file, { force: true });
  } catch (error) {
    if (hasErrorCode(error, "ENOTDIR")) return;
    throw error;
  }
}

export async function saveConfig(
  cwd: string,
  scope: ConfigScope,
  config: SkillManagerConfig,
  agentDir = getAgentDir(),
): Promise<string> {
  validateConfig({ ...config });
  const file = configPath(cwd, scope, agentDir);
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    const source = updateSource(await readForSave(file), config);
    await mkdir(dirname(file), { recursive: true });
    await writeFile(temporary, source, { mode: 0o600, flag: "wx" });
    await rename(temporary, file);
    return file;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`pi-skill-manager: could not save ${file}: ${reason}`, { cause: error });
  } finally {
    await removeTemporary(temporary);
  }
}
