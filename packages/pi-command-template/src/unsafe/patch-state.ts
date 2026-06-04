import type { PromptTemplate, Skill } from '@earendil-works/pi-coding-agent';
import type { RenderSurface } from '#src/core/types.js';

export interface UnsafeTransformInput {
  surface: RenderSurface;
  content: string;
  path?: string;
}

export type UnsafeContentTransformer = (input: UnsafeTransformInput) => string;

type ResourceLoaderPrototype = {
  getSystemPrompt?: () => string | undefined;
  getAppendSystemPrompt?: () => string[];
  getAgentsFiles?: () => { agentsFiles: Array<{ path: string; content: string }> };
  getPrompts?: () => { prompts: PromptTemplate[]; diagnostics: unknown[] };
  getSkills?: () => { skills: Skill[]; diagnostics: unknown[] };
};

type AgentSessionPrototype = {
  _expandSkillCommand?: (text: string) => string;
};

export interface UnsafePatchState {
  transformer?: UnsafeContentTransformer;
  originals: {
    getSystemPrompt?: ResourceLoaderPrototype['getSystemPrompt'];
    getAppendSystemPrompt?: ResourceLoaderPrototype['getAppendSystemPrompt'];
    getAgentsFiles?: ResourceLoaderPrototype['getAgentsFiles'];
    getPrompts?: ResourceLoaderPrototype['getPrompts'];
    getSkills?: ResourceLoaderPrototype['getSkills'];
    expandSkillCommand?: AgentSessionPrototype['_expandSkillCommand'];
  };
  installed: Set<string>;
}

const PATCH_STATE_KEY = Symbol.for('trethore.pi-command-template.patch-state');

type GlobalWithPatchState = typeof globalThis & {
  [PATCH_STATE_KEY]?: UnsafePatchState;
};

export function getUnsafePatchState(): UnsafePatchState {
  const global = globalThis as GlobalWithPatchState;
  global[PATCH_STATE_KEY] ??= {
    originals: {},
    installed: new Set(),
  };
  return global[PATCH_STATE_KEY];
}

export type { AgentSessionPrototype, ResourceLoaderPrototype };
