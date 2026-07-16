import { describe, expect, it } from 'vitest';

import { defaultConfig, type PiCodexifyConfig } from '#pi-codexify/config/schema.js';
import { getCodexifyArgumentCompletions } from '#pi-codexify/features/command/completions.js';

const commands = [
  {
    name: 'reset',
    needsMoreArgs: true,
    isAvailable: (config: PiCodexifyConfig) => config.reset.enabled,
  },
  {
    name: 'service-tier',
    needsMoreArgs: true,
    isAvailable: (config: PiCodexifyConfig) => config.codex.enabled,
  },
  {
    name: 'reasoning-summary',
    needsMoreArgs: true,
    isAvailable: (config: PiCodexifyConfig) => config.codex.enabled,
  },
] as const;

describe('codexify command completions', () => {
  it('completes reset actions', async () => {
    const completions = await getCodexifyArgumentCompletions('reset ', defaultConfig, commands);

    expect(completions).toEqual([
      { value: 'reset use', label: 'use' },
      { value: 'reset details', label: 'details' },
    ]);
  });

  it('does not complete reset actions when reset is disabled', async () => {
    const config = { ...defaultConfig, reset: { enabled: false } };

    const completions = await getCodexifyArgumentCompletions('reset ', config, commands);

    expect(completions).toBeNull();
  });

  it('completes service tier values', async () => {
    const completions = await getCodexifyArgumentCompletions('service-tier ', defaultConfig, commands);

    expect(completions).toEqual([
      { value: 'service-tier default', label: 'default' },
      { value: 'service-tier priority', label: 'priority' },
    ]);
  });

  it('completes reasoning summary values', async () => {
    const completions = await getCodexifyArgumentCompletions('reasoning-summary ', defaultConfig, commands);

    expect(completions).toEqual([
      { value: 'reasoning-summary auto', label: 'auto' },
      { value: 'reasoning-summary concise', label: 'concise' },
      { value: 'reasoning-summary detailed', label: 'detailed' },
      { value: 'reasoning-summary none', label: 'none' },
      { value: 'reasoning-summary off', label: 'off' },
    ]);
  });
});
