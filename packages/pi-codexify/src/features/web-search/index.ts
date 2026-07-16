import type { Api, Model } from '@earendil-works/pi-ai';

import { isRecord } from '@trethore/pi-shared/object.js';

const WEB_SEARCH_MULTIMODAL_CONTENT_TYPES = ['text', 'image'] as const;

interface ResponsesWebSearchTool {
  type: 'web_search';
  external_web_access: true;
  search_content_types?: string[];
}

export function applyNativeWebSearch(
  payload: unknown,
  model: Pick<Model<Api>, 'provider' | 'id'> | undefined
): unknown {
  if (!supportsNativeWebSearch(model)) return payload;
  if (!isRecord(payload)) return payload;

  if (payload.tools !== undefined && !Array.isArray(payload.tools)) return payload;

  const tools = payload.tools ?? [];
  if (tools.some((tool) => isNativeWebSearchTool(tool))) return payload;

  return {
    ...payload,
    tools: [...tools, createNativeWebSearchTool(model)],
  };
}

function createNativeWebSearchTool(model: Pick<Model<Api>, 'provider' | 'id'> | undefined): ResponsesWebSearchTool {
  const nativeTool: ResponsesWebSearchTool = {
    type: 'web_search',
    external_web_access: true,
  };

  if (supportsMultimodalNativeWebSearch(model)) {
    nativeTool.search_content_types = [...WEB_SEARCH_MULTIMODAL_CONTENT_TYPES];
  }

  return nativeTool;
}

function isNativeWebSearchTool(tool: unknown): tool is ResponsesWebSearchTool {
  return isRecord(tool) && tool.type === 'web_search';
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
