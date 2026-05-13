import { mkdtempSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { AuthStorage } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import {
  buildCodexAccountListMessage,
  deleteCodexAccount,
  saveCurrentCodexAccount,
  syncActiveCodexAccount,
  useCodexAccount,
} from '#pi-codexify/features/accounts/index.js';

const CODEX_PROVIDER = 'openai-codex';

describe('codex account profiles', () => {
  it('saves the active Pi Codex credential and switches between saved profiles', async () => {
    // Arrange
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));

    // Act
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('work'));
    await saveCurrentCodexAccount(ctx, 'work', { profilePath });
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(ctx.modelRegistry.authStorage.get(CODEX_PROVIDER)).toMatchObject({
      type: 'oauth',
      access: 'access-personal',
      refresh: 'refresh-personal',
      accountId: 'account-personal',
    });
    await expect(buildCodexAccountListMessage({ profilePath })).resolves.toContain(
      '- personal (active) [account-personal]'
    );
  });

  it('syncs refreshed active credentials back into the saved active profile', async () => {
    // Arrange
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, {
      ...createCredential('personal'),
      access: 'access-personal-refreshed',
      refresh: 'refresh-personal-refreshed',
    });
    await syncActiveCodexAccount(ctx, { profilePath });
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('other'));
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(ctx.modelRegistry.authStorage.get(CODEX_PROVIDER)).toMatchObject({
      access: 'access-personal-refreshed',
      refresh: 'refresh-personal-refreshed',
    });
  });

  it('does not sync a different manually logged-in account into the active profile', async () => {
    // Arrange
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('work'));
    await syncActiveCodexAccount(ctx, { profilePath });
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(ctx.modelRegistry.authStorage.get(CODEX_PROVIDER)).toMatchObject({
      access: 'access-personal',
      refresh: 'refresh-personal',
      accountId: 'account-personal',
    });
  });

  it('deletes saved profiles and clears the active profile marker', async () => {
    // Arrange
    const profilePath = makeProfilePath();
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    await deleteCodexAccount('personal', { profilePath });

    // Assert
    expect(await buildCodexAccountListMessage({ profilePath })).toBe('No saved Codex accounts.');
    await expect(readFile(profilePath, 'utf8')).resolves.not.toContain('"active"');
  });

  it('rejects invalid account names', async () => {
    // Arrange
    const ctx = createContext();
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, createCredential('personal'));

    // Act and assert
    await expect(
      saveCurrentCodexAccount(ctx, 'bad/name', { profilePath: makeProfilePath() })
    ).rejects.toThrow('Codex account names may only contain');
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
  return path.join(mkdtempSync(path.join(tmpdir(), 'pi-codexify-accounts-test-')), 'accounts.json');
}
