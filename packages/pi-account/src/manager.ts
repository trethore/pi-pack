import type { Provider } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { Account, AccountStore } from '#src/accounts.js';
import type { AccountManager } from '#src/command.js';
import { createAccountProvider, supportsAccounts } from '#src/provider.js';

export function createAccountManager(
  pi: Pick<ExtensionAPI, 'unregisterProvider'> & { registerProvider(provider: Provider): void },
  store: Pick<AccountStore, 'list' | 'add' | 'getDefault' | 'setDefault'>
): AccountManager {
  const registered = new Map<string, { base: Provider; alias: Provider }>();
  let accounts: Account[] = [];
  const sync = async (ctx: Pick<ExtensionContext, 'modelRegistry'>): Promise<Account[]> => {
    accounts = await store.list();
    const savedIds = new Set(accounts.map((account) => account.provider));
    for (const [id, registration] of registered) {
      if (savedIds.has(id)) continue;
      if (ctx.modelRegistry.getRegisteredNativeProvider(id) === registration.alias) pi.unregisterProvider(id);
      registered.delete(id);
    }
    for (const account of accounts) register(account, ctx);
    return accounts;
  };
  const register = (account: Account, ctx: Pick<ExtensionContext, 'modelRegistry'>): void => {
    const base = ctx.modelRegistry.getProvider(account.baseProvider);
    const previous = registered.get(account.provider);
    const existing = ctx.modelRegistry.getProvider(account.provider);
    const nativeProvider = ctx.modelRegistry.getRegisteredNativeProvider(account.provider);
    const owned = isOwnedProvider(nativeProvider, previous?.alias);
    if (existing && !owned) {
      throw new Error(`Provider ID "${account.provider}" is already registered by another extension.`);
    }
    if (!base || !supportsAccounts(base)) {
      if (existing) pi.unregisterProvider(account.provider);
      registered.delete(account.provider);
      return;
    }
    if (previous?.base === base && owned) return;
    const alias = createAccountProvider(account, base);
    pi.registerProvider(alias);
    registered.set(account.provider, { base, alias });
  };
  return { store, sync, list: () => accounts };
}

function isOwnedProvider(nativeProvider: Provider | undefined, alias: Provider | undefined): boolean {
  return nativeProvider !== undefined && nativeProvider === alias;
}
