import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  buildCodexAccountListMessage,
  deleteCodexAccount,
  saveCurrentCodexAccount,
  syncActiveCodexAccount,
  useCodexAccount,
} from '#pi-codexify/features/accounts/index.js';
import {
  CODEX_PROVIDER,
  createContext,
  createCredential,
  makeProfilePath,
  setCodexCredential,
} from '#test/utils/account-test-helpers.js';

describe('codex account profiles', () => {
  it('saves the active Pi Codex credential and switches between saved profiles', async () => {
    // Arrange
    const profilePath = makeAccountProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');

    // Act
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });
    setCodexCredential(ctx, 'work');
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
    const profilePath = makeAccountProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    ctx.modelRegistry.authStorage.set(CODEX_PROVIDER, {
      ...createCredential('personal'),
      access: 'access-personal-refreshed',
      refresh: 'refresh-personal-refreshed',
    });
    await syncActiveCodexAccount(ctx, { profilePath });
    setCodexCredential(ctx, 'other');
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(ctx.modelRegistry.authStorage.get(CODEX_PROVIDER)).toMatchObject({
      access: 'access-personal-refreshed',
      refresh: 'refresh-personal-refreshed',
    });
  });

  it('does not sync a different manually logged-in account into the active profile', async () => {
    // Arrange
    const profilePath = makeAccountProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    setCodexCredential(ctx, 'work');
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
    const profilePath = makeAccountProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
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
    setCodexCredential(ctx, 'personal');

    // Act and assert
    await expect(saveCurrentCodexAccount(ctx, 'bad/name', { profilePath: makeAccountProfilePath() })).rejects.toThrow(
      'Codex account names may only contain'
    );
  });
});

function makeAccountProfilePath(): string {
  return makeProfilePath('pi-codexify-accounts-test-');
}
