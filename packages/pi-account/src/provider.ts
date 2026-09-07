import type { Api, ApiKeyAuth, Model, Provider, ProviderAuth, RefreshModelsContext } from '@earendil-works/pi-ai';
import type { Account } from '#src/accounts.js';

export function supportsAccounts(provider: Provider): boolean {
  return Boolean(provider.auth.oauth || typeof provider.auth.apiKey?.login === 'function');
}

export function createAccountProvider<TApi extends Api>(account: Account, base: Provider<TApi>): Provider<TApi> {
  if (base.id !== account.baseProvider) throw new Error(`Provider mismatch for account "${account.name}".`);
  if (!supportsAccounts(base)) throw new Error(`${base.name} does not expose a stored-credential login flow.`);
  const name = `${base.name} (${account.name})`;
  const alias: Provider<TApi> = {
    id: account.provider,
    name,
    ...(base.baseUrl ? { baseUrl: base.baseUrl } : {}),
    ...(base.headers ? { headers: base.headers } : {}),
    auth: accountAuth(base.auth, name),
    getModels: () => remapModels(base.getModels(), account.provider),
    stream: (model, context, options) => base.stream(model, context, options),
    streamSimple: (model, context, options) => base.streamSimple(model, context, options),
  };
  if (base.filterModels) {
    const filter = base.filterModels.bind(base);
    alias.filterModels = (models, credential) =>
      remapModels(filter(remapModels(models, base.id), credential), account.provider);
  }
  if (base.refreshModels) attachModelRefresh(alias, base);
  if (base.fetchDeferred) alias.fetchDeferred = base.fetchDeferred.bind(base);
  if (base.cancelDeferred) alias.cancelDeferred = base.cancelDeferred.bind(base);
  return alias;
}

function accountAuth(auth: ProviderAuth, name: string): ProviderAuth {
  return {
    ...(auth.oauth
      ? {
          oauth: {
            ...auth.oauth,
            name,
            login: auth.oauth.login.bind(auth.oauth),
            refresh: auth.oauth.refresh.bind(auth.oauth),
            toAuth: auth.oauth.toAuth.bind(auth.oauth),
          },
        }
      : {}),
    ...(auth.apiKey?.login ? { apiKey: accountApiKeyAuth(auth.apiKey, name) } : {}),
  };
}

function accountApiKeyAuth(auth: ApiKeyAuth, name: string): ApiKeyAuth {
  return {
    name,
    ...(auth.login ? { login: auth.login.bind(auth) } : {}),
    check: async (input) => {
      if (!input.credential) return;
      if (auth.check) return auth.check(input);
      const resolved = await auth.resolve(input);
      return resolved ? { type: 'api_key', ...(resolved.source ? { source: resolved.source } : {}) } : undefined;
    },
    resolve: async (input) => (input.credential ? auth.resolve(input) : undefined),
  };
}

function remapModels<TApi extends Api>(models: readonly Model<TApi>[], provider: string): Model<TApi>[] {
  return models.map((model) => ({ ...model, provider }));
}

function attachModelRefresh<TApi extends Api>(alias: Provider<TApi>, base: Provider<TApi>): void {
  const refresh = base.refreshModels?.bind(base);
  let models: readonly Model<TApi>[] = [];
  alias.getModels = () => models;
  alias.refreshModels = async (context: RefreshModelsContext) => {
    await refresh?.({
      ...context,
      ...(context.stored ? { stored: { ...context.stored, models: remapModels(context.stored.models, base.id) } } : {}),
      publish: (publication) =>
        context.publish({
          ...publication,
          ...(publication.persist
            ? { persist: { ...publication.persist, models: remapModels(publication.persist.models, alias.id) } }
            : {}),
          update: () => {
            publication.update?.();
            models = remapModels(base.getModels(), alias.id);
          },
        }),
    });
  };
}
