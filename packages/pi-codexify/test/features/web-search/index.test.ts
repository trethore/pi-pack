import { describe, expect, it } from 'vitest';

import { applyNativeWebSearch } from '#pi-codexify/features/web-search/index.js';

const CODEX_MODEL = { provider: 'openai-codex', id: 'gpt-5.5' };
const READ_TOOL = { type: 'function', name: 'read' };

describe('web search', () => {
  it('injects native Codex web search after existing tools', () => {
    const payload = { tools: [READ_TOOL] };

    const rewrittenPayload = applyNativeWebSearch(payload, CODEX_MODEL);

    expect(rewrittenPayload).toEqual({
      tools: [READ_TOOL, { type: 'web_search', external_web_access: true, search_content_types: ['text', 'image'] }],
    });
  });

  it('omits multimodal content types for Spark models', () => {
    const rewrittenPayload = applyNativeWebSearch(
      { tools: [READ_TOOL] },
      { provider: 'openai-codex', id: 'gpt-5.3-codex-spark' }
    );

    expect(rewrittenPayload).toEqual({
      tools: [READ_TOOL, { type: 'web_search', external_web_access: true }],
    });
  });

  it('does not inject duplicate native web search tools', () => {
    const payload = { tools: [READ_TOOL, { type: 'web_search', external_web_access: true }] };

    const rewrittenPayload = applyNativeWebSearch(payload, CODEX_MODEL);

    expect(rewrittenPayload).toBe(payload);
  });

  it('leaves non-Codex and malformed payloads unchanged', () => {
    const nonCodexPayload = { tools: [READ_TOOL] };
    const malformedPayload = { tools: 'invalid' };

    expect(applyNativeWebSearch(nonCodexPayload, { provider: 'openai', id: 'gpt-5.5' })).toBe(nonCodexPayload);
    expect(applyNativeWebSearch(malformedPayload, CODEX_MODEL)).toBe(malformedPayload);
  });
});
