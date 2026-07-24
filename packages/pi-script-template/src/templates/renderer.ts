import { ScriptOutputCache, type ScriptOutputCacheOptions } from '#src/scripts/cache.js';
import type { ScriptTemplateRenderer } from '#src/templates/types.js';

const TEMPLATE_PATTERN = /\{\{\s*([A-Za-z0-9_-]+)\s*\}\}/g;

export function createScriptTemplateRenderer(options: ScriptOutputCacheOptions): ScriptTemplateRenderer {
  const cache = new ScriptOutputCache(options);
  return {
    render: (content) => renderScriptTemplates(content, cache),
    getDiagnostics: () => cache.getDiagnostics(),
  };
}

export function renderScriptTemplates(content: string, cache: Pick<ScriptOutputCache, 'getOutput'>): string {
  return content.replaceAll(TEMPLATE_PATTERN, (match, name: string) => cache.getOutput(name) ?? match);
}
