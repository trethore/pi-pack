import { describe, expect, it } from 'vitest';

import { defaultConfig, type PiCodexifyConfig } from '#pi-codexify/config/types.js';
import { getCompletions } from '#pi-codexify/command/completions.js';

describe('codexify command completions', () => {
  it('completes reset actions', async () => {
    const completions = await getCompletions('reset ', defaultConfig);

    expect(completions).toEqual([
      { value: 'reset use', label: 'use' },
      { value: 'reset details', label: 'details' },
    ]);
  });

  it('does not complete reset actions when reset is disabled', async () => {
    const config: PiCodexifyConfig = { ...defaultConfig, reset: false };

    const completions = await getCompletions('reset ', config);

    expect(completions).toBeNull();
  });

  it('completes service tier values', async () => {
    const completions = await getCompletions('service-tier ', defaultConfig);

    expect(completions).toEqual([
      { value: 'service-tier default', label: 'default' },
      { value: 'service-tier priority', label: 'priority' },
    ]);
  });

  it('completes reasoning summary values', async () => {
    const completions = await getCompletions('reasoning-summary ', defaultConfig);

    expect(completions).toEqual([
      { value: 'reasoning-summary auto', label: 'auto' },
      { value: 'reasoning-summary concise', label: 'concise' },
      { value: 'reasoning-summary detailed', label: 'detailed' },
      { value: 'reasoning-summary none', label: 'none' },
      { value: 'reasoning-summary off', label: 'off' },
    ]);
  });
});
