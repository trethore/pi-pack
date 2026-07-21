import type { Api, Model } from '@earendil-works/pi-ai';
import { isRecord } from '@trethore/pi-shared/object.js';

interface WebSearchTool {
  type: 'web_search';
  external_web_access: true;
  search_content_types?: string[];
}

export function applyWebSearch(payload: unknown, model: Pick<Model<Api>, 'provider' | 'id'> | undefined): unknown {
  if (!isCodexModel(model) || !isRecord(payload)) return payload;
  if (payload.tools !== undefined && !Array.isArray(payload.tools)) return payload;

  const tools = payload.tools ?? [];
  if (tools.some((tool) => isRecord(tool) && tool.type === 'web_search')) return payload;

  return { ...payload, tools: [...tools, createWebSearchTool(model)] };
}

function createWebSearchTool(model: Pick<Model<Api>, 'provider' | 'id'>): WebSearchTool {
  return model.id.toLowerCase().includes('spark')
    ? { type: 'web_search', external_web_access: true }
    : {
        type: 'web_search',
        external_web_access: true,
        search_content_types: ['text', 'image'],
      };
}

function isCodexModel(
  model: Pick<Model<Api>, 'provider' | 'id'> | undefined
): model is Pick<Model<Api>, 'provider' | 'id'> {
  return model?.provider.toLowerCase() === 'openai-codex';
}
