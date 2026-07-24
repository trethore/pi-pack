import type { PromptTemplate, Skill } from '@earendil-works/pi-coding-agent';

export type PiContentSurface =
  | 'systemPrompt'
  | 'appendSystemPrompt'
  | 'contextFile'
  | 'promptTemplate'
  | 'skillDescription'
  | 'skillInvocation';

export interface PiContentTransformInput {
  surface: PiContentSurface;
  content: string;
  name?: string;
  path?: string;
  workspaceCwd?: string;
  projectTrusted?: boolean;
}

export type PiContentTransformMetadata = Omit<PiContentTransformInput, 'surface' | 'content'>;

export type PiContentTransformer = (input: PiContentTransformInput) => string;

export interface ResourceLoaderContext {
  cwd?: string;
  settingsManager?: {
    isProjectTrusted(): boolean;
  };
}

export type ResourceLoaderPrototype = {
  getSystemPrompt?: () => string | undefined;
  getAppendSystemPrompt?: () => string[];
  getAgentsFiles?: () => { agentsFiles: Array<{ path: string; content: string }> };
  getPrompts?: () => { prompts: PromptTemplate[]; diagnostics: unknown[] };
  getSkills?: () => { skills: Skill[]; diagnostics: unknown[] };
};

export type AgentSessionPrototype = {
  _expandSkillCommand?: (text: string) => string;
  resourceLoader?: ResourceLoaderContext & {
    getSkills(): { skills: Skill[] };
  };
};

export interface PiContentTransformState {
  transformers: Map<string, PiContentTransformer>;
  installed: Set<string>;
}

const PATCH_STATE_KEY = Symbol.for('trethore.pi-shared.content-transform.patch-state');

type GlobalWithPatchState = typeof globalThis & {
  [PATCH_STATE_KEY]?: PiContentTransformState;
};

export function getPiContentTransformState(): PiContentTransformState {
  const global = globalThis as GlobalWithPatchState;
  global[PATCH_STATE_KEY] ??= {
    transformers: new Map(),
    installed: new Set(),
  };
  return global[PATCH_STATE_KEY];
}

export function transformPiContent(input: PiContentTransformInput): string {
  let content = input.content;
  for (const transformer of getPiContentTransformState().transformers.values()) {
    content = transformer({ ...input, content });
  }
  return content;
}

export function hasPiContentTransformers(): boolean {
  return getPiContentTransformState().transformers.size > 0;
}

export function getResourceLoaderTransformContext(
  resourceLoader: ResourceLoaderContext | undefined
): Pick<PiContentTransformInput, 'workspaceCwd' | 'projectTrusted'> {
  return {
    workspaceCwd: resourceLoader?.cwd,
    projectTrusted: resourceLoader?.settingsManager?.isProjectTrusted(),
  };
}
