import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { registerToolmask } from '#pi-toolmask/index.js';
import type { PiToolmaskConfig } from '#pi-toolmask/config/schema.js';

const defaultConfig: PiToolmaskConfig = {
  enabled: true,
  masks: [],
  enforceBeforeAgentStart: true,
  notify: false,
};

describe('registerToolmask', () => {
  it('restores only tools disabled by toolmask across all applications', () => {
    // Arrange
    const harness = createExtensionHarness(['read', 'bash', 'write']);
    registerToolmask(harness.pi, { ...defaultConfig, masks: ['bash', 'mcp_*'] });

    // Act
    harness.emit('session_start', { reason: 'startup' });
    harness.replaceActiveTools(['read', 'mcp_danger']);
    harness.emit('before_agent_start', {});
    harness.emit('session_shutdown', { reason: 'reload' });

    // Assert
    expect(harness.getActiveTools()).toEqual(['read', 'bash', 'mcp_danger']);
    expect(harness.setActiveToolsCalls).toEqual([['read', 'write'], ['read'], ['read', 'bash', 'mcp_danger']]);
  });

  it('does not duplicate a masked tool that is active again before reload', () => {
    // Arrange
    const harness = createExtensionHarness(['read', 'bash']);
    registerToolmask(harness.pi, { ...defaultConfig, masks: ['bash'] });
    harness.emit('session_start', { reason: 'startup' });
    harness.replaceActiveTools(['read', 'bash']);

    // Act
    harness.emit('session_shutdown', { reason: 'reload' });

    // Assert
    expect(harness.getActiveTools()).toEqual(['read', 'bash']);
    expect(harness.setActiveToolsCalls).toEqual([['read']]);
  });
});

type ExtensionHandler = (event: unknown, ctx: ExtensionContext) => void;

function createExtensionHarness(initialActiveTools: string[]) {
  const handlers = new Map<string, ExtensionHandler>();
  const setActiveToolsCalls: string[][] = [];
  let activeTools = [...initialActiveTools];

  const pi = {
    on: (event: string, handler: ExtensionHandler) => {
      handlers.set(event, handler);
    },
    getActiveTools: () => [...activeTools],
    setActiveTools: (toolNames: string[]) => {
      activeTools = [...toolNames];
      setActiveToolsCalls.push([...toolNames]);
    },
  } as unknown as ExtensionAPI;

  const ctx = {
    ui: {
      notify: () => 0,
    },
  } as unknown as ExtensionContext;

  return {
    pi,
    setActiveToolsCalls,
    emit: (event: string, payload: unknown) => handlers.get(event)?.(payload, ctx),
    getActiveTools: () => activeTools,
    replaceActiveTools: (toolNames: string[]) => {
      activeTools = [...toolNames];
    },
  };
}
