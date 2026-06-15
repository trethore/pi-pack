import { describe, expect, it } from 'vitest';

import type { PiToolmaskConfig } from '#pi-toolmask/config/schema.js';
import { applyToolmask } from '#pi-toolmask/core/toolmask.js';

const defaultConfig: PiToolmaskConfig = {
  enabled: true,
  masks: [],
  enforceBeforeAgentStart: true,
  notify: false,
};

describe('applyToolmask', () => {
  it('disables active tools matching masks', () => {
    const { calls, pi } = createToolmaskPi(['read', 'bash', 'write', 'mcp_read_docs']);

    const result = applyToolmask(pi, { ...defaultConfig, masks: ['bash', 'mcp_*'] });

    expect(result).toEqual({
      activeTools: ['read', 'bash', 'write', 'mcp_read_docs'],
      nextActiveTools: ['read', 'write'],
      maskedTools: ['bash', 'mcp_read_docs'],
      changed: true,
    });
    expect(calls).toEqual([['read', 'write']]);
  });

  it('does not set active tools when nothing matches', () => {
    const { calls, pi } = createToolmaskPi(['read', 'bash']);

    const result = applyToolmask(pi, { ...defaultConfig, masks: ['write'] });

    expect(result.changed).toBe(false);
    expect(calls).toEqual([]);
  });

  it('can disable all active tools', () => {
    const { calls, pi } = createToolmaskPi(['read', 'bash']);

    const result = applyToolmask(pi, { ...defaultConfig, masks: ['*'] });

    expect(result.nextActiveTools).toEqual([]);
    expect(calls).toEqual([[]]);
  });

  it('keeps tools matching negated masks', () => {
    const { calls, pi } = createToolmaskPi(['read', 'bash', 'write', 'edit']);

    const result = applyToolmask(pi, { ...defaultConfig, masks: ['*', '!read'] });

    expect(result.nextActiveTools).toEqual(['read']);
    expect(result.maskedTools).toEqual(['bash', 'write', 'edit']);
    expect(calls).toEqual([['read']]);
  });

  it('does not disable anything when only negated masks are configured', () => {
    const { calls, pi } = createToolmaskPi(['read', 'bash']);

    const result = applyToolmask(pi, { ...defaultConfig, masks: ['!read'] });

    expect(result.changed).toBe(false);
    expect(calls).toEqual([]);
  });
});

function createToolmaskPi(activeTools: string[]) {
  const calls: string[][] = [];
  return {
    calls,
    pi: {
      getActiveTools: () => activeTools,
      setActiveTools: (toolNames: string[]) => calls.push(toolNames),
    },
  };
}
