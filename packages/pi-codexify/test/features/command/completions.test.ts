import { describe, expect, it } from 'vitest';

import { defaultConfig, type PiCodexifyConfig } from '#pi-codexify/config/schema.js';
import { saveCurrentCodexAccount } from '#pi-codexify/features/accounts/index.js';
import { getCodexifyArgumentCompletions } from '#pi-codexify/features/command/completions.js';
import { createContext, makeProfilePath, setCodexCredential } from '#test/utils/account-test-helpers.js';

const commands = [
  {
    name: 'account',
    needsMoreArgs: true,
    isAvailable: (config: PiCodexifyConfig) => config.account.enabled,
  },
  {
    name: 'reset',
    needsMoreArgs: true,
    isAvailable: (config: PiCodexifyConfig) => config.reset.enabled,
  },
  {
    name: 'serviceTier',
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
  it('completes saved account names for account use', async () => {
    // Arrange
    const profilePath = makeCompletionProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });
    setCodexCredential(ctx, 'work');
    await saveCurrentCodexAccount(ctx, 'work', { profilePath });

    // Act
    const completions = await getCodexifyArgumentCompletions('account use w', defaultConfig, commands, {
      accountProfilePath: profilePath,
    });

    // Assert
    expect(completions).toEqual([{ value: 'account use work', label: 'work' }]);
  });

  it('completes saved account names for account delete', async () => {
    // Arrange
    const profilePath = makeCompletionProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    const completions = await getCodexifyArgumentCompletions('account delete ', defaultConfig, commands, {
      accountProfilePath: profilePath,
    });

    // Assert
    expect(completions).toEqual([{ value: 'account delete personal', label: 'personal' }]);
  });

  it('does not complete account names for account save', async () => {
    // Arrange
    const profilePath = makeCompletionProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    const completions = await getCodexifyArgumentCompletions('account save p', defaultConfig, commands, {
      accountProfilePath: profilePath,
    });

    // Assert
    expect(completions).toBeNull();
  });

  it('does not complete account arguments when accounts are disabled', async () => {
    // Arrange
    const config = { ...defaultConfig, account: { enabled: false } };

    // Act
    const completions = await getCodexifyArgumentCompletions('account ', config, commands);

    // Assert
    expect(completions).toBeNull();
  });

  it('completes reset actions', async () => {
    // Arrange / Act
    const completions = await getCodexifyArgumentCompletions('reset ', defaultConfig, commands);

    // Assert
    expect(completions).toEqual([
      { value: 'reset use', label: 'use' },
      { value: 'reset details', label: 'details' },
    ]);
  });

  it('does not complete reset actions when reset is disabled', async () => {
    // Arrange
    const config = { ...defaultConfig, reset: { enabled: false } };

    // Act
    const completions = await getCodexifyArgumentCompletions('reset ', config, commands);

    // Assert
    expect(completions).toBeNull();
  });

  it('completes service tier values', async () => {
    // Arrange / Act
    const completions = await getCodexifyArgumentCompletions('serviceTier ', defaultConfig, commands);

    // Assert
    expect(completions).toEqual([
      { value: 'serviceTier slow', label: 'slow' },
      { value: 'serviceTier fast', label: 'fast' },
    ]);
  });

  it('completes reasoning summary values', async () => {
    // Arrange / Act
    const completions = await getCodexifyArgumentCompletions('reasoning-summary ', defaultConfig, commands);

    // Assert
    expect(completions).toEqual([
      { value: 'reasoning-summary auto', label: 'auto' },
      { value: 'reasoning-summary concise', label: 'concise' },
      { value: 'reasoning-summary detailed', label: 'detailed' },
      { value: 'reasoning-summary none', label: 'none' },
      { value: 'reasoning-summary off', label: 'off' },
    ]);
  });
});

function makeCompletionProfilePath(): string {
  return makeProfilePath('pi-codexify-completions-test-');
}
