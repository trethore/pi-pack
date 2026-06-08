import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';

import { isRecord } from '@trethore/pi-shared/object.js';

const WEB_SEARCH_PARAMETERS = Type.Unsafe<Record<string, never>>({
  type: 'object',
  additionalProperties: false,
});

const WEB_SEARCH_MULTIMODAL_CONTENT_TYPES = ['text', 'image'] as const;
const WEB_SEARCH_UNSUPPORTED_MESSAGE = 'web_search is only available with the openai-codex provider';
const WEB_SEARCH_LOCAL_EXECUTION_MESSAGE =
  'web_search is a native openai-codex provider tool and should not execute locally';

interface WebSearchConfig {
  enabled: boolean;
}

interface FunctionToolPayload {
  type?: unknown;
  name?: unknown;
}

interface ResponsesWebSearchTool {
  type: 'web_search';
  external_web_access: true;
  search_content_types?: string[];
}

export function registerWebSearch(pi: ExtensionAPI, config: WebSearchConfig): void {
  if (!config.enabled) return;

  pi.registerTool(createWebSearchTool());

  pi.on('session_start', (_event, ctx) => {
    syncWebSearchActiveTool(pi, ctx.model);
  });

  pi.on('model_select', (event) => {
    syncWebSearchActiveTool(pi, event.model);
  });

  pi.on('before_provider_request', (event, ctx) => {
    if (!supportsNativeWebSearch(ctx.model)) return;
    return rewriteNativeWebSearchTool(event.payload, ctx.model);
  });
}

function createWebSearchTool(): ToolDefinition<typeof WEB_SEARCH_PARAMETERS> {
  return {
    name: 'web_search',
    label: 'Web Search',
    description: 'Search the web for current or external information.',
    promptSnippet: 'Use web_search when the task requires up-to-date facts, external sources, or broader context.',
    promptGuidelines: ['Do not use web_search for repository-local questions.'],
    parameters: WEB_SEARCH_PARAMETERS,
    prepareArguments: () => ({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      if (!supportsNativeWebSearch(ctx.model)) {
        throw new Error(WEB_SEARCH_UNSUPPORTED_MESSAGE);
      }
      throw new Error(WEB_SEARCH_LOCAL_EXECUTION_MESSAGE);
    },
  };
}

function rewriteNativeWebSearchTool(payload: unknown, model: Pick<Model<Api>, 'provider' | 'id'> | undefined): unknown {
  if (!isRecord(payload) || !Array.isArray(payload.tools)) return payload;

  let rewritten = false;
  const tools = payload.tools.map((tool) => {
    if (!isWebSearchFunctionTool(tool)) return tool;

    rewritten = true;
    const nativeTool: ResponsesWebSearchTool = {
      type: 'web_search',
      external_web_access: true,
    };

    if (supportsMultimodalNativeWebSearch(model)) {
      nativeTool.search_content_types = [...WEB_SEARCH_MULTIMODAL_CONTENT_TYPES];
    }

    return nativeTool;
  });

  if (!rewritten) return payload;

  return {
    ...payload,
    tools,
  };
}

function syncWebSearchActiveTool(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'setActiveTools'>,
  model: Pick<Model<Api>, 'provider' | 'id'> | null | undefined
): void {
  const activeTools = new Set(pi.getActiveTools());

  if (supportsNativeWebSearch(model)) {
    activeTools.add('web_search');
  } else {
    activeTools.delete('web_search');
  }

  pi.setActiveTools([...activeTools]);
}

function isWebSearchFunctionTool(tool: unknown): tool is FunctionToolPayload {
  return isRecord(tool) && tool.type === 'function' && tool.name === 'web_search';
}

function supportsNativeWebSearch(
  model: Pick<Model<Api>, 'provider'> | null | undefined
): model is Pick<Model<Api>, 'provider' | 'id'> {
  return (model?.provider ?? '').toLowerCase() === 'openai-codex';
}

function supportsMultimodalNativeWebSearch(model: Pick<Model<Api>, 'provider' | 'id'> | undefined): boolean {
  if (!supportsNativeWebSearch(model)) return false;
  return !model.id.toLowerCase().includes('spark');
}
