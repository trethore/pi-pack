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
    const result = await syncActiveCodexAccount(ctx, { profilePath });
    setCodexCredential(ctx, 'other');
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(result).toBe('synced');
    expect(ctx.modelRegistry.authStorage.get(CODEX_PROVIDER)).toMatchObject({
      access: 'access-personal-refreshed',
      refresh: 'refresh-personal-refreshed',
    });
  });

  it('saves without a name into the active saved profile', async () => {
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
    const savedName = await saveCurrentCodexAccount(ctx, undefined, { profilePath });
    setCodexCredential(ctx, 'other');
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(savedName).toBe('personal');
    expect(ctx.modelRegistry.authStorage.get(CODEX_PROVIDER)).toMatchObject({
      access: 'access-personal-refreshed',
      refresh: 'refresh-personal-refreshed',
    });
  });

  it('rejects save without a name when there is no active saved profile', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');

    // Act and assert
    await expect(saveCurrentCodexAccount(ctx, undefined, { profilePath: makeAccountProfilePath() })).rejects.toThrow(
      'Missing Codex account name and no active Codex account profile.'
    );
  });

  it('does not sync a different manually logged-in account into the active profile', async () => {
    // Arrange
    const profilePath = makeAccountProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    setCodexCredential(ctx, 'work');
    const result = await syncActiveCodexAccount(ctx, { profilePath });
    await useCodexAccount(ctx, 'personal', { profilePath });

    // Assert
    expect(result).toBe('different-account');
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

  it('reports when active credentials are already synced', async () => {
    // Arrange
    const profilePath = makeAccountProfilePath();
    const ctx = createContext();
    setCodexCredential(ctx, 'personal');
    await saveCurrentCodexAccount(ctx, 'personal', { profilePath });

    // Act
    const result = await syncActiveCodexAccount(ctx, { profilePath });

    // Assert
    expect(result).toBe('unchanged');
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
