import type { CredentialStore, OAuthCredential } from '@earendil-works/pi-ai';
import { readStoredCredential, type ModelRegistry } from '@earendil-works/pi-coding-agent';
import { CODEX_PROVIDER, isCodexProvider } from '@trethore/shared/codex-provider.js';
import { isPlainObject } from '@trethore/shared/object.js';

export { CODEX_PROVIDER } from '@trethore/shared/codex-provider.js';

export type CodexCredential = OAuthCredential & {
  type: 'oauth';
  accountId?: unknown;
  account_id?: unknown;
};

export type CodexCredentialContext = {
  model?: { provider: string } | undefined;
  credentialStore?: CredentialStore;
  modelRegistry: Pick<ModelRegistry, 'getApiKeyForProvider'>;
};

export async function getCodexCredential(ctx: CodexCredentialContext): Promise<CodexCredential> {
  const provider = ctx.model && isCodexProvider(ctx.model.provider) ? ctx.model.provider : CODEX_PROVIDER;
  const accessToken = await ctx.modelRegistry.getApiKeyForProvider(provider);
  const credential = ctx.credentialStore ? await ctx.credentialStore.read(provider) : readStoredCredential(provider);

  if (!isCodexCredential(credential) || !accessToken) {
    throw new Error(`No active ${provider} OAuth credential. Use /login ${provider} first.`);
  }

  return { ...credential, access: accessToken };
}

export function getAccountId(credential: CodexCredential): string | undefined {
  const accountId = credential.accountId ?? credential.account_id;
  return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : undefined;
}

function isCodexCredential(value: unknown): value is CodexCredential {
  return (
    isPlainObject(value) &&
    value.type === 'oauth' &&
    typeof value.access === 'string' &&
    typeof value.refresh === 'string' &&
    typeof value.expires === 'number'
  );
}
