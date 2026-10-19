import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { isObject } from "@pi-pack/shared/validation";
import { EXTENSION_NAME } from "#src/constants";

export const STATE_TYPE = `${EXTENSION_NAME}:generation`;

export interface ResolvedGeneration {
  version: 1;
  status: "resolved";
  customPrompt?: string | null;
  appendSystemPrompt?: string;
}

export type Generation = { version: 1; status: "pending" } | ResolvedGeneration;

export function newGeneration(): Generation {
  return { version: 1, status: "pending" };
}

function validSurface(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function resolvedSurfaces(value: Record<string, unknown>): ResolvedGeneration {
  if (
    !validSurface(value.customPrompt) ||
    !validSurface(value.appendSystemPrompt) ||
    value.appendSystemPrompt === null
  ) {
    throw new Error(`${EXTENSION_NAME}: invalid saved surfaces; reload to reset them`);
  }
  const resolved: ResolvedGeneration = { version: 1, status: "resolved" };
  if (typeof value.customPrompt === "string" || value.customPrompt === null) {
    resolved.customPrompt = value.customPrompt;
  }
  if (typeof value.appendSystemPrompt === "string") {
    resolved.appendSystemPrompt = value.appendSystemPrompt;
  }
  return resolved;
}

function parseGeneration(value: unknown): Generation {
  if (!isObject(value) || value.version !== 1) {
    throw new Error(`${EXTENSION_NAME}: invalid saved generation; reload to reset it`);
  }
  if (value.status === "pending") {
    return newGeneration();
  }
  if (value.status === "resolved") {
    return resolvedSurfaces(value);
  }
  throw new Error(`${EXTENSION_NAME}: invalid saved generation status; reload to reset it`);
}

export function restoreGeneration(branch: readonly SessionEntry[]): Generation | undefined {
  const entry = branch.findLast((candidate) => candidate.type === "custom" && candidate.customType === STATE_TYPE);
  return entry?.type === "custom" ? parseGeneration(entry.data) : undefined;
}
