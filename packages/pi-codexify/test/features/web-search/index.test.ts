import { describe, expect, it } from 'vitest';

import { registerWebSearch } from '#pi-codexify/features/web-search/index.js';

type TestModel = {
  provider: string;
  id: string;
};
type Handler = (event: { model?: TestModel; payload?: unknown }, ctx: { model?: TestModel }) => unknown;
type RegisteredTool = {
  name: string;
};

const CODEX_MODEL = { provider: 'openai-codex', id: 'gpt-5-codex' } satisfies TestModel;
const OPENAI_MODEL = { provider: 'openai', id: 'gpt-5' } satisfies TestModel;
const NATIVE_WEB_SEARCH_TOOL = {
  type: 'web_search',
  external_web_access: true,
  search_content_types: ['text', 'image'],
};
const SPARK_NATIVE_WEB_SEARCH_TOOL = {
  type: 'web_search',
  external_web_access: true,
};
const READ_TOOL = { type: 'function', name: 'read' };

describe('web search', () => {
  it('does not register any hooks or tools when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerWebSearch(pi.extensionApi, { enabled: false });

    // Assert
    expect(pi.tools).toEqual([]);
    expect(pi.registeredEventNames).toEqual([]);
  });

  it('registers only a provider payload hook when enabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Assert
    expect(pi.tools).toEqual([]);
    expect(pi.registeredEventNames).toEqual(['before_provider_request']);
  });

  it('injects native codex web search after existing tools', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });
    const payload = {
      input: 'search',
      tools: [READ_TOOL],
    };

    // Act
    const rewrittenPayload = pi.emitBeforeProviderRequest(payload, CODEX_MODEL);

    // Assert
    expect(rewrittenPayload).toEqual({
      input: 'search',
      tools: [READ_TOOL, NATIVE_WEB_SEARCH_TOOL],
    });
  });

  it('injects native codex web search when the payload has no tools', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Act
    const rewrittenPayload = pi.emitBeforeProviderRequest({ input: 'search' }, CODEX_MODEL);

    // Assert
    expect(rewrittenPayload).toEqual({
      input: 'search',
      tools: [NATIVE_WEB_SEARCH_TOOL],
    });
  });

  it('omits multimodal content types for codex spark models', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Act
    const rewrittenPayload = pi.emitBeforeProviderRequest(
      { tools: [READ_TOOL] },
      { provider: 'openai-codex', id: 'codex-spark' }
    );

    // Assert
    expect(rewrittenPayload).toEqual({
      tools: [READ_TOOL, SPARK_NATIVE_WEB_SEARCH_TOOL],
    });
  });

  it('does not inject duplicate native web search tools', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });
    const payload = {
      tools: [READ_TOOL, SPARK_NATIVE_WEB_SEARCH_TOOL],
    };

    // Act
    const rewrittenPayload = pi.emitBeforeProviderRequest(payload, CODEX_MODEL);

    // Assert
    expect(rewrittenPayload).toBe(payload);
  });

  it('does not inject tools for non-codex providers', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Act
    const unchangedPayload = pi.emitBeforeProviderRequest({ tools: [READ_TOOL] }, OPENAI_MODEL);

    // Assert
    expect(unchangedPayload).toBeUndefined();
  });

  it('does not replace malformed tools payloads', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });
    const payload = { tools: 'invalid' };

    // Act
    const rewrittenPayload = pi.emitBeforeProviderRequest(payload, CODEX_MODEL);

    // Assert
    expect(rewrittenPayload).toBe(payload);
  });
});

function createPi() {
  const handlers = new Map<string, Handler[]>();
  const state = {
    tools: [] as RegisteredTool[],
  };

  const pi = {
    get tools() {
      return state.tools;
    },
    get registeredEventNames() {
      return [...handlers.keys()];
    },
    extensionApi: {
      registerTool(tool: RegisteredTool) {
        state.tools.push(tool);
      },
      on(eventName: string, handler: Handler) {
        const eventHandlers = handlers.get(eventName) ?? [];
        eventHandlers.push(handler);
        handlers.set(eventName, eventHandlers);
      },
    } as unknown as Parameters<typeof registerWebSearch>[0],
    emitBeforeProviderRequest(payload: unknown, model: TestModel) {
      return emit('before_provider_request', { payload }, { model });
    },
  };

  function emit(eventName: string, event: { model?: TestModel; payload?: unknown }, ctx: { model?: TestModel }) {
    return handlers.get(eventName)?.at(-1)?.(event, ctx);
  }

  return pi;
}
