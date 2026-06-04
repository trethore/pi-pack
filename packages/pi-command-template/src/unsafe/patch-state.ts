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
  transformers: Map<string, UnsafeContentTransformer>;
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

type LegacyUnsafePatchState = Omit<UnsafePatchState, 'transformers'> & {
  transformer?: UnsafeContentTransformer;
  transformers?: Map<string, UnsafeContentTransformer>;
};

type GlobalWithPatchState = typeof globalThis & {
  [PATCH_STATE_KEY]?: LegacyUnsafePatchState;
};

export function getUnsafePatchState(): UnsafePatchState {
  const global = globalThis as GlobalWithPatchState;
  global[PATCH_STATE_KEY] ??= {
    transformers: new Map(),
    originals: {},
    installed: new Set(),
  };

  const state = global[PATCH_STATE_KEY];
  state.transformers ??= new Map();
  if (state.transformer) {
    state.transformers.set('legacy', state.transformer);
    delete state.transformer;
  }
  return state as UnsafePatchState;
}

export function transformUnsafeContent(input: UnsafeTransformInput): string {
  let content = input.content;
  for (const transformer of getUnsafePatchState().transformers.values()) {
    content = transformer({ ...input, content });
  }
  return content;
}

export type { AgentSessionPrototype, ResourceLoaderPrototype };
