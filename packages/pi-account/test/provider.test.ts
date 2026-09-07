import { createModels, InMemoryCredentialStore, type OAuthCredential, type Provider } from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { describe, expect, it, vi } from 'vitest';
import { createAccount } from '#pi-account/accounts.js';
import { createAccountProvider } from '#pi-account/provider.js';

describe('Codex account providers', () => {
  it('reuses Codex auth and models with distinct account provider IDs', () => {
    // Arrange
    const base = openaiCodexProvider();
    const account = createAccount('work');

    // Act
    const alias = createAccountProvider(account, base);

    // Assert
    expect(alias.id).toBe(account.provider);
    expect(alias.name).toBe('OpenAI Codex (work)');
    expect(alias.auth.oauth?.name).toBe(alias.name);
    expect(alias.auth.oauth?.isSubscription).toBe(true);
    expect(alias.baseUrl).toBe(base.baseUrl);
    expect(alias.getModels()).toEqual(base.getModels().map((model) => ({ ...model, provider: account.provider })));
    expect(base.getModels().every((model) => model.provider === 'openai-codex')).toBe(true);
  });

  it('resolves each saved account without logging in again', async () => {
    // Arrange
    const personal = createAccountProvider(createAccount('personal'), openaiCodexProvider());
    const work = createAccountProvider(createAccount('work'), openaiCodexProvider());
    const credentials = await createCredentialStore({
      [personal.id]: credential('personal'),
      [work.id]: credential('work'),
    });
    const models = createModels({ credentials });
    models.setProvider(personal);
    models.setProvider(work);
    const login = vi.spyOn(requireOAuth(work), 'login');

    // Act / Assert
    await expect(models.getAuth(personal.id)).resolves.toMatchObject({ auth: { apiKey: 'access-personal' } });
    await expect(models.getAuth(work.id)).resolves.toMatchObject({ auth: { apiKey: 'access-work' } });
    await expect(models.getAuth(personal.id)).resolves.toMatchObject({ auth: { apiKey: 'access-personal' } });
    expect(login).not.toHaveBeenCalled();
  });

  it('refreshes only the selected alias and persists its rotated tokens', async () => {
    // Arrange
    const work = createAccountProvider(createAccount('work'), openaiCodexProvider());
    const expired = { ...credential('old-work'), expires: 0 };
    const personal = credential('personal');
    const credentials = await createCredentialStore({ [work.id]: expired, 'openai-codex': personal });
    const models = createModels({ credentials });
    models.setProvider(work);
    const refreshed = credential('new-work');
    const refresh = vi.spyOn(requireOAuth(work), 'refresh').mockResolvedValue(refreshed);

    // Act
    const auth = await models.getAuth(work.id);

    // Assert
    expect(auth?.auth.apiKey).toBe('access-new-work');
    expect(refresh).toHaveBeenCalledWith(expired, expect.any(AbortSignal));
    expect(await credentials.read(work.id)).toEqual(refreshed);
    expect(await credentials.read('openai-codex')).toEqual(personal);
  });

  it('does not fall back to the built-in account when an alias is logged out', async () => {
    // Arrange
    const work = createAccountProvider(createAccount('work'), openaiCodexProvider());
    const credentials = await createCredentialStore({ 'openai-codex': credential('personal') });
    const models = createModels({ credentials });
    models.setProvider(work);

    // Act / Assert
    expect(await models.getAuth(work.id)).toBeUndefined();
  });
});

function credential(name: string): OAuthCredential {
  return { type: 'oauth', access: `access-${name}`, refresh: `refresh-${name}`, expires: Date.now() + 3_600_000 };
}

function requireOAuth(provider: Provider) {
  const oauth = provider.auth.oauth;
  if (!oauth) throw new Error('Missing Codex OAuth');
  return oauth;
}

async function createCredentialStore(entries: Record<string, OAuthCredential>): Promise<InMemoryCredentialStore> {
  const store = new InMemoryCredentialStore();
  await Promise.all(Object.entries(entries).map(([provider, value]) => store.modify(provider, async () => value)));
  return store;
}
