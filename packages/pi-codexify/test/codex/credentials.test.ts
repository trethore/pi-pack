import { describe, expect, it } from 'vitest';
import { getCodexCredential } from '#pi-codexify/codex/credentials.js';
import { createContext, createCredential, setCodexCredential } from '#test/utils/codex-credential-test-helpers.js';

describe('Codex account credentials', () => {
  it('uses the selected alias instead of the built-in account', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'default');
    const provider = 'openai-codex-account-work';
    ctx.credentialStore.set(provider, createCredential('work'));

    // Act
    const credential = await getCodexCredential({ ...ctx, model: { provider } });

    // Assert
    expect(credential.access).toBe('access-work');
    expect(credential.accountId).toBe('account-work');
  });

  it('does not fall back when the selected alias has no credentials', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'default');
    const provider = 'openai-codex-account-work';

    // Act / Assert
    await expect(getCodexCredential({ ...ctx, model: { provider } })).rejects.toThrow(`/login ${provider}`);
  });

  it('keeps the existing built-in lookup when a non-Codex model is selected', async () => {
    // Arrange
    const ctx = createContext();
    setCodexCredential(ctx, 'default');

    // Act
    const credential = await getCodexCredential({ ...ctx, model: { provider: 'anthropic' } });

    // Assert
    expect(credential.access).toBe('access-default');
  });
});
