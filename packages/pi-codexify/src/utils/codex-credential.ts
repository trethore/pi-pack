import type { CredentialStore, OAuthCredential } from '@earendil-works/pi-ai';
import { readStoredCredential, type ModelRegistry } from '@earendil-works/pi-coding-agent';
import { isRecord } from '@trethore/pi-shared/object.js';

export const CODEX_PROVIDER = 'openai-codex';

export type CodexCredential = OAuthCredential & {
  type: 'oauth';
  accountId?: unknown;
  account_id?: unknown;
};

export type CodexCredentialContext = {
  credentialStore?: CredentialStore;
  modelRegistry: Pick<ModelRegistry, 'getApiKeyForProvider'>;
};

export async function getCurrentCodexCredential(ctx: CodexCredentialContext): Promise<CodexCredential> {
  const accessToken = await ctx.modelRegistry.getApiKeyForProvider(CODEX_PROVIDER);
  const credential = ctx.credentialStore
    ? await ctx.credentialStore.read(CODEX_PROVIDER)
    : readStoredCredential(CODEX_PROVIDER);

  if (!isCodexCredential(credential) || !accessToken) {
    throw new Error(`No active ${CODEX_PROVIDER} OAuth credential. Use /login ${CODEX_PROVIDER} first.`);
  }

  return { ...credential, access: accessToken };
}

export function getCodexCredentialAccountId(credential: CodexCredential): string | undefined {
  const accountId = credential.accountId ?? credential.account_id;
  return typeof accountId === 'string' && accountId.trim() ? accountId.trim() : undefined;
}

function isCodexCredential(value: unknown): value is CodexCredential {
  return (
    isRecord(value) &&
    value.type === 'oauth' &&
    typeof value.access === 'string' &&
    typeof value.refresh === 'string' &&
    typeof value.expires === 'number'
  );
}
