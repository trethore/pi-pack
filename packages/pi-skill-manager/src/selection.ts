import { dirname } from "node:path";
import { createSyntheticSourceInfo, type SessionEntry, type Skill } from "@earendil-works/pi-coding-agent";
import { defaultConfig, validateConfig, type SkillManagerConfig } from "./config.ts";

export const selectionEntryType = "pi-skill-manager-selection";

type Advertisement = Pick<Skill, "name" | "description" | "filePath" | "disableModelInvocation">;

interface SavedSelection {
  version: 1;
  config: SkillManagerConfig;
  locked: boolean;
  advertisements: Advertisement[] | null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function object(value: unknown): Record<string, unknown> {
  if (!isObject(value)) {
    throw new Error("pi-skill-manager: invalid saved session selection");
  }
  return value;
}

function readAdvertisement(value: unknown): Advertisement {
  const record = object(value);
  const { name, description, filePath, disableModelInvocation } = record;
  if (typeof name !== "string" || typeof description !== "string" || typeof filePath !== "string") {
    throw new Error("pi-skill-manager: invalid saved skill advertisement");
  }
  if (typeof disableModelInvocation !== "boolean") {
    throw new Error("pi-skill-manager: invalid saved skill invocation flag");
  }
  return { name, description, filePath, disableModelInvocation };
}

function readSelection(value: unknown): SavedSelection {
  const record = object(value);
  if (record.version !== 1 || typeof record.locked !== "boolean") {
    throw new Error("pi-skill-manager: invalid saved session selection version or lock");
  }
  if (record.advertisements !== null && !Array.isArray(record.advertisements)) {
    throw new Error("pi-skill-manager: invalid saved advertisements");
  }
  return {
    version: 1,
    config: validateConfig(object(record.config)),
    locked: record.locked,
    advertisements: record.advertisements === null ? null : record.advertisements.map(readAdvertisement),
  };
}

function savedSelection(entries: SessionEntry[]): SavedSelection | undefined {
  const entry = entries.findLast((item) => item.type === "custom" && item.customType === selectionEntryType);
  return entry?.type === "custom" ? readSelection(entry.data) : undefined;
}

function hasAgentHistory(entry: SessionEntry): boolean {
  if (entry.type === "compaction") return true;
  return entry.type === "message" && (entry.message.role === "assistant" || entry.message.role === "system");
}

function restoreSkill(advertisement: Advertisement): Skill {
  return {
    ...advertisement,
    baseDir: dirname(advertisement.filePath),
    sourceInfo: createSyntheticSourceInfo(advertisement.filePath, { source: "pi-skill-manager-session" }),
  };
}

export class SessionSelection {
  config = defaultConfig();
  locked = false;
  private advertisements: Advertisement[] | null = null;

  restore(entries: SessionEntry[], config: SkillManagerConfig): void {
    // A corrupt snapshot must not leak the previous session's selection into this one.
    this.config = defaultConfig();
    this.locked = true;
    this.advertisements = null;
    // The lock belongs to the whole session, not a branch. Tree navigation cannot unlock it.
    const saved = savedSelection(entries) ?? {
      version: 1,
      config: structuredClone(config),
      locked: false,
      advertisements: null,
    };
    this.config = saved.config;
    this.locked = saved.locked;
    this.advertisements = saved.advertisements;
    if (entries.some(hasAgentHistory) && !this.locked) {
      this.config = defaultConfig();
      this.locked = true;
    }
  }

  apply(config: SkillManagerConfig): void {
    if (this.locked)
      throw new Error("pi-skill-manager: session selection is locked; save for a future session instead");
    this.config = structuredClone(config);
  }

  filter(skills: Skill[]): Skill[] {
    if (this.advertisements !== null) return this.advertisements.map(restoreSkill);
    const rules = new Map(this.config.skills);
    const retained = skills.filter((skill) => !this.config.enabled || rules.get(skill.name) !== false);
    this.advertisements = retained.map(({ name, description, filePath, disableModelInvocation }) => ({
      name,
      description,
      filePath,
      disableModelInvocation,
    }));
    this.locked = true;
    return retained;
  }

  snapshot(): SavedSelection {
    return structuredClone({
      version: 1,
      config: this.config,
      locked: this.locked,
      advertisements: this.advertisements,
    });
  }
}

export class SkillDraft {
  enabled: boolean;
  private readonly rules: Map<string, boolean>;
  private readonly savedRules: Map<string, boolean>;

  readonly skills: Skill[];

  constructor(config: SkillManagerConfig, skills: Skill[], savedConfig = config) {
    this.skills = skills;
    this.enabled = config.enabled;
    this.rules = new Map(config.skills);
    this.savedRules = new Map(savedConfig.skills);
  }

  allows(name: string): boolean {
    return this.rules.get(name) !== false;
  }

  isUnsaved(name: string): boolean {
    return this.allows(name) !== (this.savedRules.get(name) !== false);
  }

  toggle(name: string): void {
    this.rules.set(name, !this.allows(name));
  }

  setAll(enabled: boolean): void {
    for (const skill of this.skills) this.rules.set(skill.name, enabled);
  }

  missing(): string[] {
    const loadedNames = new Set(this.skills.map((skill) => skill.name));
    return [...this.rules.keys()].filter((name) => !loadedNames.has(name));
  }

  remove(name: string): void {
    this.rules.delete(name);
  }

  removeMissing(): void {
    for (const name of this.missing()) this.remove(name);
  }

  config(): SkillManagerConfig {
    return { enabled: this.enabled, skills: [...this.rules.entries()] };
  }
}
