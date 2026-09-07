import { envApiKeyAuth, type Provider } from '@earendil-works/pi-ai';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { describe, expect, it, vi } from 'vitest';
import { createAccount, type Account } from '#pi-account/accounts.js';
import { createAccountManager } from '#pi-account/manager.js';

function createHarness(accounts: Account[] = [createAccount('work', 'extension-provider')]) {
  const providers = new Map<string, Provider>();
  const nativeProviders = new Map<string, Provider>();
  const pi = {
    registerProvider: vi.fn((provider: Provider) => {
      providers.set(provider.id, provider);
      nativeProviders.set(provider.id, provider);
    }),
    unregisterProvider: vi.fn((id: string) => {
      providers.delete(id);
      nativeProviders.delete(id);
    }),
  };
  const store = { list: vi.fn(async () => accounts), getDefault: vi.fn(), setDefault: vi.fn(), add: vi.fn() };
  const ctx = {
    modelRegistry: {
      getProvider: (id: string) => providers.get(id),
      getRegisteredNativeProvider: (id: string) => nativeProviders.get(id),
    },
  } as unknown as ExtensionContext;
  const manager = createAccountManager(pi, store);
  const base: Provider = {
    id: 'extension-provider',
    name: 'Extension Provider',
    auth: { apiKey: envApiKeyAuth('Extension API key', ['EXTENSION_API_KEY']) },
    getModels: () => [],
    stream: vi.fn(),
    streamSimple: vi.fn(),
  };
  return { manager, pi, store, ctx, providers, nativeProviders, base, accounts };
}

describe('account provider registration', () => {
  it('discovers an extension provider after it becomes available', async () => {
    // Arrange
    const { manager, pi, ctx, providers, base, accounts } = createHarness();

    // Act
    await manager.sync(ctx);
    expect(pi.registerProvider).not.toHaveBeenCalled();
    providers.set(base.id, base);
    await manager.sync(ctx);
    await manager.sync(ctx);

    // Assert
    expect(manager.list()).toEqual(accounts);
    expect(pi.registerProvider).toHaveBeenCalledOnce();
    expect(pi.registerProvider).toHaveBeenCalledWith(expect.objectContaining({ name: 'Extension Provider (work)' }));
  });

  it('refreshes aliases when another extension replaces the base provider', async () => {
    // Arrange
    const { manager, pi, ctx, providers, base } = createHarness();
    providers.set(base.id, base);
    await manager.sync(ctx);

    // Act
    providers.set(base.id, { ...base, name: 'Updated Extension Provider' });
    await manager.sync(ctx);

    // Assert
    expect(pi.registerProvider).toHaveBeenCalledTimes(2);
    expect(pi.registerProvider).toHaveBeenLastCalledWith(
      expect.objectContaining({ name: 'Updated Extension Provider (work)' })
    );
  });

  it('does not treat an overlay on its own native provider as an ID collision', async () => {
    // Arrange
    const { manager, pi, ctx, providers, base } = createHarness();
    providers.set(base.id, base);
    await manager.sync(ctx);
    const alias = pi.registerProvider.mock.calls[0]?.[0];
    if (!alias) throw new Error('Missing alias');
    providers.set(alias.id, { ...alias, headers: { 'X-Overlay': 'value' } });

    // Act
    await manager.sync(ctx);

    // Assert
    expect(pi.registerProvider).toHaveBeenCalledOnce();
  });

  it('does not overwrite a provider registered by another extension', async () => {
    // Arrange
    const { manager, pi, ctx, providers, base, accounts } = createHarness();
    const account = accounts[0];
    if (!account) throw new Error('Missing account');
    providers.set(base.id, base);
    providers.set(account.provider, { ...base, id: account.provider });

    // Act / Assert
    await expect(manager.sync(ctx)).rejects.toThrow('already registered');
    expect(pi.registerProvider).not.toHaveBeenCalled();
  });

  it.each(['removed', 'ambient-only'] as const)('removes stale aliases when the base is %s', async (scenario) => {
    // Arrange
    const { manager, pi, ctx, providers, base } = createHarness();
    providers.set(base.id, base);
    await manager.sync(ctx);

    // Act
    if (scenario === 'removed') providers.delete(base.id);
    else providers.set(base.id, { ...base, auth: { apiKey: { name: 'Ambient', resolve: vi.fn() } } });
    await manager.sync(ctx);

    // Assert
    expect(pi.unregisterProvider).toHaveBeenCalledExactlyOnceWith(createAccount('work', base.id).provider);
  });

  it('removes aliases whose metadata was deleted by another instance', async () => {
    // Arrange
    const { manager, pi, ctx, providers, store, base } = createHarness();
    providers.set(base.id, base);
    await manager.sync(ctx);
    store.list.mockResolvedValue([]);

    // Act
    await manager.sync(ctx);

    // Assert
    expect(manager.list()).toEqual([]);
    expect(pi.unregisterProvider).toHaveBeenCalledExactlyOnceWith(createAccount('work', base.id).provider);
  });

  it('keeps a replacement provider when account metadata is removed', async () => {
    // Arrange
    const { manager, pi, ctx, providers, nativeProviders, store, base } = createHarness();
    providers.set(base.id, base);
    await manager.sync(ctx);
    const id = createAccount('work', base.id).provider;
    const replacement = { ...base, id };
    providers.set(id, replacement);
    nativeProviders.set(id, replacement);
    store.list.mockResolvedValue([]);

    // Act
    await manager.sync(ctx);

    // Assert
    expect(pi.unregisterProvider).not.toHaveBeenCalled();
    expect(providers.get(id)).toBe(replacement);
  });
});
