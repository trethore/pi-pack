import { describe, expect, it } from 'vitest';

import { registerWebSearch } from '#pi-codexify/features/web-search/index.js';

type TestModel = {
  provider: string;
  id: string;
};
type Handler = (
  event: { model?: TestModel; payload?: unknown },
  ctx: { model?: TestModel }
) => unknown;
type RegisteredTool = {
  name: string;
  execute: (
    toolCallId: string,
    params: Record<string, never>,
    signal: AbortSignal,
    onUpdate: () => void,
    ctx: { model?: TestModel }
  ) => Promise<unknown>;
};

describe('web search', () => {
  it('does not register any hooks or tools when disabled', () => {
    // Arrange
    const pi = createPi();

    // Act
    registerWebSearch(pi.extensionApi, { enabled: false });

    // Assert
    expect(pi.tools).toEqual([]);
    expect(pi.handlerCount).toBe(0);
  });

  it('registers web_search and toggles it active for openai-codex models only', () => {
    // Arrange
    const pi = createPi(['read']);
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Act
    pi.emitSessionStart({ provider: 'openai-codex', id: 'gpt-5-codex' });
    const activeForCodex = pi.activeTools;
    pi.emitModelSelect({ provider: 'openai', id: 'gpt-5' });
    const activeForOpenAI = pi.activeTools;

    // Assert
    expect(pi.tools.map((tool) => tool.name)).toEqual(['web_search']);
    expect(activeForCodex).toEqual(['read', 'web_search']);
    expect(activeForOpenAI).toEqual(['read']);
  });

  it('rewrites registered web_search function tools into native codex web search tools', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });
    const payload = {
      input: 'search',
      tools: [
        { type: 'function', name: 'web_search' },
        { type: 'function', name: 'read' },
      ],
    };

    // Act
    const result = pi.emitBeforeProviderRequest(payload, {
      provider: 'openai-codex',
      id: 'gpt-5-codex',
    });

    // Assert
    expect(result).toEqual({
      input: 'search',
      tools: [
        {
          type: 'web_search',
          external_web_access: true,
          search_content_types: ['text', 'image'],
        },
        { type: 'function', name: 'read' },
      ],
    });
  });

  it('omits multimodal content types for codex spark models', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Act
    const result = pi.emitBeforeProviderRequest(
      { tools: [{ type: 'function', name: 'web_search' }] },
      { provider: 'openai-codex', id: 'codex-spark' }
    );

    // Assert
    expect(result).toEqual({
      tools: [{ type: 'web_search', external_web_access: true }],
    });
  });

  it('does not rewrite tools for non-codex providers', () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });

    // Act
    const result = pi.emitBeforeProviderRequest(
      { tools: [{ type: 'function', name: 'web_search' }] },
      { provider: 'openai', id: 'gpt-5' }
    );

    // Assert
    expect(result).toBeUndefined();
  });

  it('registered tool execution fails locally with provider-specific messages', async () => {
    // Arrange
    const pi = createPi();
    registerWebSearch(pi.extensionApi, { enabled: true });
    const tool = pi.tools[0];
    const signal = new AbortController().signal;

    // Act and assert
    await expect(
      tool.execute('call-id', {}, signal, () => {}, {
        model: { provider: 'openai', id: 'gpt-5' },
      })
    ).rejects.toThrow('web_search is only available with the openai-codex provider');
    await expect(
      tool.execute('call-id', {}, signal, () => {}, {
        model: { provider: 'openai-codex', id: 'gpt-5-codex' },
      })
    ).rejects.toThrow('web_search is a native openai-codex provider tool');
  });
});

function createPi(initialActiveTools: string[] = []) {
  const handlers = new Map<string, Handler[]>();
  const state = {
    tools: [] as RegisteredTool[],
    activeTools: [...initialActiveTools],
  };

  const pi = {
    get tools() {
      return state.tools;
    },
    get activeTools() {
      return state.activeTools;
    },
    get handlerCount() {
      return [...handlers.values()].reduce(
        (count, eventHandlers) => count + eventHandlers.length,
        0
      );
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
      getActiveTools() {
        return state.activeTools;
      },
      setActiveTools(activeTools: string[]) {
        state.activeTools = activeTools;
      },
    } as unknown as Parameters<typeof registerWebSearch>[0],
    emitSessionStart(model: TestModel) {
      return emit('session_start', {}, { model });
    },
    emitModelSelect(model: TestModel) {
      return emit('model_select', { model }, {});
    },
    emitBeforeProviderRequest(payload: unknown, model: TestModel) {
      return emit('before_provider_request', { payload }, { model });
    },
  };

  function emit(
    eventName: string,
    event: { model?: TestModel; payload?: unknown },
    ctx: { model?: TestModel }
  ) {
    return handlers.get(eventName)?.at(-1)?.(event, ctx);
  }

  return pi;
}
