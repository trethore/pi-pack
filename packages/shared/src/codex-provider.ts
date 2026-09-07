export const CODEX_PROVIDER = 'openai-codex';
export const CODEX_ACCOUNT_PREFIX = 'openai-codex-account-';

export function isCodexProvider(provider: string | undefined): boolean {
  const normalized = provider?.toLowerCase();
  return normalized === CODEX_PROVIDER || normalized?.startsWith(CODEX_ACCOUNT_PREFIX) === true;
}
