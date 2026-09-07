import {
  createModels,
  envApiKeyAuth,
  InMemoryCredentialStore,
  InMemoryModelsStore,
  type Api,
  type ApiKeyCredential,
  type Credential,
  type Model,
  type Provider,
  type RefreshModelsContext,
} from '@earendil-works/pi-ai';
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex';
import { describe, expect, it, vi } from 'vitest';
import { createAccount } from '#pi-account/accounts.js';
import { createAccountProvider, supportsAccounts } from '#pi-account/provider.js';

function customProvider(): Provider {
  const template = openaiCodexProvider().getModels()[0];
  if (!template) throw new Error('Missing model fixture');
  return {
    id: 'custom-extension',
    name: 'Custom Extension',
    auth: { apiKey: envApiKeyAuth('Custom API key', ['CUSTOM_API_KEY']) },
    headers: { 'X-Custom': 'custom-header' },
    getModels: () => [{ ...template, id: 'custom-model', provider: 'custom-extension' }],
    stream: vi.fn(),
    streamSimple: vi.fn(),
  };
}

function apiCredential(key: string): ApiKeyCredential {
  return { type: 'api_key', key, env: { CUSTOM_TENANT: key } };
}

describe('generic account providers', () => {
  it('uses extension provider metadata without requiring a base URL', () => {
    // Arrange
    const base = customProvider();
    const account = createAccount('work', base.id);

    // Act
    const alias = createAccountProvider(account, base);

    // Assert
    expect(alias.id).toBe(account.provider);
    expect(alias.name).toBe('Custom Extension (work)');
    expect(alias.auth.apiKey?.name).toBe(alias.name);
    expect(alias.headers).toEqual(base.headers);
    expect(alias.baseUrl).toBeUndefined();
    expect(alias.getModels()).toEqual(base.getModels().map((model) => ({ ...model, provider: account.provider })));
  });

  it('logs in, resolves, and logs out separate API-key accounts without ambient fallback', async () => {
    // Arrange
    const base = customProvider();
    const personal = createAccountProvider(createAccount('personal', base.id), base);
    const work = createAccountProvider(createAccount('work', base.id), base);
    const credentials = new InMemoryCredentialStore();
    const models = createModels({
      credentials,
      authContext: { env: async () => 'ambient-key', fileExists: async () => true },
    });
    models.setProvider(base);
    models.setProvider(personal);
    models.setProvider(work);

    // Act
    await models.login(personal.id, 'api_key', { prompt: async () => 'personal-key', notify: vi.fn() });
    await models.login(work.id, 'api_key', { prompt: async () => 'work-key', notify: vi.fn() });

    // Assert
    expect(await models.getAuth(personal.id)).toMatchObject({ auth: { apiKey: 'personal-key' } });
    expect(await models.getAuth(work.id)).toMatchObject({ auth: { apiKey: 'work-key' } });
    expect(await models.getAuth(base.id)).toMatchObject({ auth: { apiKey: 'ambient-key' } });
    await models.logout(work.id);
    expect(await models.getAuth(work.id)).toBeUndefined();
    expect(await models.checkAuth(work.id)).toBeUndefined();
    expect(await models.getAuth(personal.id)).toMatchObject({ auth: { apiKey: 'personal-key' } });
  });

  it('preserves provider-scoped environment and method receivers', async () => {
    // Arrange
    let base = customProvider();
    const auth = {
      name: 'Custom',
      marker: 'custom-auth',
      login: vi.fn(async () => apiCredential('work')),
      check: vi.fn(async function (this: { marker: string }) {
        return { type: 'api_key' as const, source: this.marker };
      }),
      resolve: vi.fn(async function (this: { marker: string }, input: { credential?: ApiKeyCredential }) {
        return {
          auth: input.credential?.key ? { apiKey: input.credential.key } : {},
          ...(input.credential?.env ? { env: input.credential.env } : {}),
          source: this.marker,
        };
      }),
    };
    base = { ...base, auth: { apiKey: auth } };
    const alias = createAccountProvider(createAccount('work', base.id), base);
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(alias.id, async () => apiCredential('work'));
    const models = createModels({ credentials });
    models.setProvider(alias);

    // Act / Assert
    expect(await models.getAuth(alias.id)).toMatchObject({ env: { CUSTOM_TENANT: 'work' }, source: 'custom-auth' });
    expect(await models.checkAuth(alias.id)).toEqual({ type: 'api_key', source: 'custom-auth' });
  });

  it('keeps both login methods on mixed OAuth and API-key providers', () => {
    // Arrange
    let base = customProvider();
    const oauth = openaiCodexProvider().auth.oauth;
    if (!oauth) throw new Error('Missing OAuth fixture');
    base = { ...base, auth: { ...base.auth, oauth } };

    // Act
    const alias = createAccountProvider(createAccount('work', base.id), base);

    // Assert
    expect(alias.auth.apiKey?.login).toBeTypeOf('function');
    expect(alias.auth.oauth?.login).toBeTypeOf('function');
    expect(alias.auth.oauth?.isSubscription).toBe(true);
  });

  it('delegates streaming and deferred operations', async () => {
    // Arrange
    const base = customProvider();
    base.fetchDeferred = vi.fn();
    base.cancelDeferred = vi.fn();
    const alias = createAccountProvider(createAccount('work', base.id), base);
    const model = alias.getModels()[0];
    if (!model) throw new Error('Missing model fixture');
    const context = { messages: [] };
    const options = { apiKey: 'work-key' };
    const handle = { id: 'deferred-job' } as Parameters<NonNullable<Provider['fetchDeferred']>>[1];

    // Act
    alias.stream(model, context, options);
    alias.streamSimple(model, context, options);
    alias.fetchDeferred?.(model, handle, options);
    await alias.cancelDeferred?.(model, handle, options);

    // Assert
    expect(base.stream).toHaveBeenCalledWith(model, context, options);
    expect(base.streamSimple).toHaveBeenCalledWith(model, context, options);
    expect(base.fetchDeferred).toHaveBeenCalledWith(model, handle, options);
    expect(base.cancelDeferred).toHaveBeenCalledWith(model, handle, options);
  });

  it('applies account-specific model filtering with the original provider identity', async () => {
    // Arrange
    const base = customProvider();
    base.filterModels = vi.fn((models: readonly Model<Api>[], credential: Credential | undefined) =>
      credential?.type === 'api_key' ? models : []
    );
    const alias = createAccountProvider(createAccount('work', base.id), base);
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(alias.id, async () => apiCredential('work'));
    const models = createModels({ credentials });
    models.setProvider(alias);

    // Act
    const available = await models.getAvailable(alias.id);

    // Assert
    expect(available).toEqual(alias.getModels());
    expect(base.filterModels).toHaveBeenCalledWith(base.getModels(), apiCredential('work'));
  });

  it.each(['ambient', 'keyless'])('rejects %s providers without a stored-credential login', (kind) => {
    // Arrange
    const base = { ...customProvider(), auth: { apiKey: { name: kind, resolve: async () => ({ auth: {} }) } } };

    // Act / Assert
    expect(supportsAccounts(base)).toBe(false);
    expect(() => createAccountProvider(createAccount('work', base.id), base)).toThrow('stored-credential');
  });

  it('rejects mismatched provider metadata', () => {
    // Arrange
    const base = customProvider();

    // Act / Assert
    expect(() => createAccountProvider(createAccount('work', 'other-provider'), base)).toThrow('mismatch');
  });
});

describe('dynamic account model catalogs', () => {
  it('refreshes and persists separate catalogs with alias IDs and restores them as base IDs', async () => {
    // Arrange
    const base = customProvider();
    const template = base.getModels()[0];
    if (!template) throw new Error('Missing model fixture');
    let currentModels: readonly Model<Api>[] = [];
    base.getModels = () => currentModels;
    base.refreshModels = vi.fn(async (context: RefreshModelsContext) => {
      if (context.stored) {
        expect(context.stored.models.every((model) => model.provider === base.id)).toBe(true);
        const restored = context.stored.models;
        await context.publish({
          update: () => {
            currentModels = restored;
          },
        });
      }
      if (!context.allowNetwork) return;
      const key = (context.credential?.type === 'api_key' ? context.credential.key : undefined) ?? 'missing';
      const fetched = [{ ...template, id: `model-${key}` }];
      await context.publish({
        persist: { models: fetched, etag: key },
        update: () => {
          currentModels = fetched;
        },
      });
    });
    const personal = createAccountProvider(createAccount('personal', base.id), base);
    const work = createAccountProvider(createAccount('work', base.id), base);
    const credentials = new InMemoryCredentialStore();
    await credentials.modify(personal.id, async () => apiCredential('personal'));
    await credentials.modify(work.id, async () => apiCredential('work'));
    const modelsStore = new InMemoryModelsStore();
    const models = createModels({ credentials, modelsStore });
    models.setProvider(personal);
    models.setProvider(work);

    // Act
    await models.refresh({ allowNetwork: true });
    const reloadedWork = createAccountProvider(createAccount('work', base.id), base);
    models.setProvider(reloadedWork);
    await models.refresh({ providers: [work.id], allowNetwork: false });

    // Assert
    expect(personal.getModels()).toMatchObject([{ id: 'model-personal', provider: personal.id }]);
    expect(reloadedWork.getModels()).toMatchObject([{ id: 'model-work', provider: work.id }]);
    expect(await modelsStore.read(work.id)).toMatchObject({ etag: 'work', models: [{ provider: work.id }] });
    expect(await modelsStore.read(base.id)).toBeUndefined();
  });

  it('does not apply a rejected model publication', async () => {
    // Arrange
    const base = customProvider();
    const update = vi.fn();
    base.refreshModels = async (context) => {
      await context.publish({ update });
    };
    const alias = createAccountProvider(createAccount('work', base.id), base);

    // Act
    await alias.refreshModels?.({
      allowNetwork: true,
      signal: new AbortController().signal,
      publish: async () => false,
    });

    // Assert
    expect(update).not.toHaveBeenCalled();
    expect(alias.getModels()).toEqual([]);
  });
});
