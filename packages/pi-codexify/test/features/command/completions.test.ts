import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AuthStorage } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { defaultConfig, type PiCodexifyConfig } from '#pi-codexify/config/schema.js';
import { saveCurrentCodexAccount } from '#pi-codexify/features/accounts/index.js';
import { getCodexifyArgumentCompletions } from '#pi-codexify/features/command/completions.js';

const CODEX_PROVIDER = 'openai-codex';

const commands = [
  {
    name: 'account',
    needsMoreArgs: true,
    isAvailable: (config: PiCodexifyConfig) => config.account.enabled,
  },
] as const;

describe('codexify command completions', () => {
  it('completes saved account names for account use', async () => {
    // Arrange
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('work'));
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
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));
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
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));
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
});

function createContext() {
  return {
    modelRegistry: {
      authStorage: AuthStorage.inMemory(),
    },
  };
}

function createCredential(label: string) {
  return {
    type: 'oauth' as const,
    access: `access-${label}`,
    refresh: `refresh-${label}`,
    expires: 1_800_000_000_000,
    accountId: `account-${label}`,
  };
}

function makeProfilePath(): string {
  return path.join(mkdtempSync(path.join(tmpdir(), 'pi-codexify-completions-test-')), 'accounts.json');
}
