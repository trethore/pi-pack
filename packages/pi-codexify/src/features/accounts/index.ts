import { promises as fs } from 'node:fs';
import path from 'node:path';

import type { OAuthCredential } from '@earendil-works/pi-ai';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import {
  applyCodexCredentialHeaders,
  CODEX_PROVIDER,
  getCredentialAccountId,
  readCodexCredential,
  writeCodexCredential,
  type CodexCredentialContext,
} from '#src/features/accounts/credentials.js';

export { CODEX_PROVIDER } from '#src/features/accounts/credentials.js';
export type { CodexCredentialContext } from '#src/features/accounts/credentials.js';
const DEFAULT_PROFILE_PATH = path.join(getAgentDir(), 'pi-codexify-codex-accounts.json');

export type CodexAccountAction = 'current' | 'delete' | 'list' | 'save' | 'use';

export const codexAccountActions = ['list', 'current', 'save', 'use', 'delete'] as const;

export type OpenAICodexCredential = OAuthCredential & {
  type: 'oauth';
  accountId?: unknown;
  account_id?: unknown;
};

type CodexAccountProfiles = {
  active?: string;
  accounts: Record<string, OpenAICodexCredential>;
};

type CodexAccountOptions = {
  profilePath?: string;
  reloadAuth?: boolean;
};

type CurrentCredentialOptions = {
  allowMissing?: boolean;
  reload?: boolean;
};

export type CodexAccountSyncResult =
  | 'different-account'
  | 'missing-active'
  | 'missing-current'
  | 'synced'
  | 'unchanged';

export type CodexAuthContext = CodexCredentialContext;

export function registerCodexAccountSync(pi: ExtensionAPI): void {
  pi.on('before_provider_request', async (_event, ctx) => {
    if (ctx.model?.provider !== CODEX_PROVIDER) return;
    await syncActiveCodexAccount(ctx, { reloadAuth: false });
  });
  pi.on('before_provider_headers', async (event, ctx) => {
    if (ctx.model?.provider !== CODEX_PROVIDER) return;
    await applyCodexCredentialHeaders(ctx, event.headers);
  });
}

export async function handleCodexAccountCommand(parts: readonly string[], ctx: ExtensionCommandContext): Promise<void> {
  const action = parseCodexAccountAction(parts[1]);

  if (!action) {
    ctx.ui.notify(getCodexAccountUsage(), 'warning');
    return;
  }

  try {
    if (action === 'list') {
      ctx.ui.notify(await buildCodexAccountListMessage(), 'info');
      return;
    }

    if (action === 'current') {
      ctx.ui.notify(await buildCurrentCodexAccountMessage(), 'info');
      return;
    }

    const name = normalizeAccountName(parts[2]);

    if (action === 'save') {
      const savedName = await saveCurrentCodexAccount(ctx, name);
      ctx.ui.notify(`Codex account saved as ${savedName}.`, 'info');
      return;
    }

    if (!name) {
      ctx.ui.notify(getCodexAccountUsage(), 'warning');
      return;
    }

    if (action === 'use') {
      await useCodexAccount(ctx, name);
      ctx.ui.notify(`Codex account switched to ${name}.`, 'info');
      return;
    }

    await deleteCodexAccount(name);
    ctx.ui.notify(`Codex account deleted: ${name}.`, 'info');
  } catch (error) {
    ctx.ui.notify(`codexify account failed: ${getErrorMessage(error)}`, 'error');
  }
}

export async function handleCodexAccountSyncCommand(ctx: ExtensionCommandContext): Promise<void> {
  try {
    const result = await syncActiveCodexAccount(ctx);
    ctx.ui.notify(formatCodexAccountSyncMessage(result), result === 'different-account' ? 'warning' : 'info');
  } catch (error) {
    ctx.ui.notify(`codexify sync failed: ${getErrorMessage(error)}`, 'error');
  }
}

export function parseCodexAccountAction(value: string | undefined): CodexAccountAction | undefined {
  return codexAccountActions.find((action) => action === value);
}

function getCodexAccountUsage(): string {
  return [
    'Usage:',
    '/codexify account list',
    '/codexify account current',
    '/codexify account save [name]',
    '/codexify account use <name>',
    '/codexify account delete <name>',
  ].join('\n');
}

export async function saveCurrentCodexAccount(
  ctx: CodexAuthContext,
  name?: string,
  options: CodexAccountOptions = {}
): Promise<string> {
  const explicitAccountName = name === undefined ? undefined : requireAccountName(name);
  const profiles = await loadProfiles(options.profilePath);
  const accountName = explicitAccountName ?? requireActiveAccountName(profiles);
  const credential = await getCurrentCodexCredential(ctx);

  profiles.accounts[accountName] = credential;
  profiles.active = accountName;
  await saveProfiles(profiles, options.profilePath);
  return accountName;
}

export async function useCodexAccount(
  ctx: CodexAuthContext,
  name: string,
  options: CodexAccountOptions = {}
): Promise<void> {
  const accountName = requireAccountName(name);
  let profiles = await loadProfiles(options.profilePath);

  if (profiles.active !== accountName) {
    await syncActiveCodexAccount(ctx, options);
    profiles = await loadProfiles(options.profilePath);
  }

  const credential = profiles.accounts[accountName];
  if (!credential) {
    throw new Error(`Unknown Codex account: ${accountName}`);
  }

  await writeCodexCredential(ctx, credential);
  profiles.active = accountName;
  await saveProfiles(profiles, options.profilePath);
}

export async function deleteCodexAccount(name: string, options: CodexAccountOptions = {}): Promise<void> {
  const accountName = requireAccountName(name);
  const profiles = await loadProfiles(options.profilePath);

  if (!profiles.accounts[accountName]) {
    throw new Error(`Unknown Codex account: ${accountName}`);
  }

  delete profiles.accounts[accountName];
  if (profiles.active === accountName) delete profiles.active;
  await saveProfiles(profiles, options.profilePath);
}

export async function syncActiveCodexAccount(
  ctx: CodexAuthContext,
  options: CodexAccountOptions = {}
): Promise<CodexAccountSyncResult> {
  const profiles = await loadProfiles(options.profilePath);
  if (!profiles.active || !profiles.accounts[profiles.active]) return 'missing-active';

  const activeCredential = profiles.accounts[profiles.active];
  const credential = await getCurrentCodexCredential(ctx, { allowMissing: true, reload: options.reloadAuth });
  if (!credential) return 'missing-current';
  if (!isSameCodexAccount(activeCredential, credential)) return 'different-account';
  if (hasSameTokenData(activeCredential, credential)) return 'unchanged';

  profiles.accounts[profiles.active] = credential;
  await saveProfiles(profiles, options.profilePath);
  return 'synced';
}

export async function buildCodexAccountListMessage(options: CodexAccountOptions = {}): Promise<string> {
  const profiles = await loadProfiles(options.profilePath);
  const names = Object.keys(profiles.accounts);

  if (names.length === 0) return 'No saved Codex accounts.';

  return [
    'Saved Codex accounts',
    ...names.map((name) => formatAccountLine(name, profiles.accounts[name], profiles.active)),
  ].join('\n');
}

export async function getSavedCodexAccountNames(options: CodexAccountOptions = {}): Promise<string[]> {
  const profiles = await loadProfiles(options.profilePath);
  return Object.keys(profiles.accounts);
}

async function buildCurrentCodexAccountMessage(options: CodexAccountOptions = {}): Promise<string> {
  const profiles = await loadProfiles(options.profilePath);
  if (!profiles.active) return 'No active Codex account profile.';

  const credential = profiles.accounts[profiles.active];
  if (!credential) return `Active Codex account profile is missing: ${profiles.active}`;

  return `Active Codex account: ${profiles.active}${formatAccountIdSuffix(credential)}`;
}

export async function getCurrentCodexCredential(
  ctx: CodexCredentialContext,
  options?: CurrentCredentialOptions & { allowMissing?: false }
): Promise<OpenAICodexCredential>;
export async function getCurrentCodexCredential(
  ctx: CodexCredentialContext,
  options: CurrentCredentialOptions & { allowMissing: true }
): Promise<OpenAICodexCredential | undefined>;
export async function getCurrentCodexCredential(
  ctx: CodexCredentialContext,
  options: CurrentCredentialOptions = {}
): Promise<OpenAICodexCredential | undefined> {
  const credential = await readCodexCredential(ctx, options.reload !== false);

  if (isOpenAICodexCredential(credential)) return credential;
  if (options.allowMissing) return undefined;

  throw new Error(`No active ${CODEX_PROVIDER} OAuth credential. Use /login ${CODEX_PROVIDER} first.`);
}

function isOpenAICodexCredential(credential: unknown): credential is OpenAICodexCredential {
  return (
    isRecord(credential) &&
    credential.type === 'oauth' &&
    typeof credential.access === 'string' &&
    typeof credential.refresh === 'string'
  );
}

function formatAccountLine(
  name: string,
  credential: OpenAICodexCredential | undefined,
  active: string | undefined
): string {
  const activeMarker = name === active ? ' (active)' : '';
  return `- ${name}${activeMarker}${formatAccountIdSuffix(credential)}`;
}

function formatAccountIdSuffix(credential: OpenAICodexCredential | undefined): string {
  const accountId = getCodexCredentialAccountId(credential);
  return accountId ? ` [${accountId}]` : '';
}

function isSameCodexAccount(
  left: OpenAICodexCredential | undefined,
  right: OpenAICodexCredential | undefined
): boolean {
  const leftAccountId = getCodexCredentialAccountId(left);
  const rightAccountId = getCodexCredentialAccountId(right);
  if (leftAccountId && rightAccountId) return leftAccountId === rightAccountId;
  return true;
}

function hasSameTokenData(left: OpenAICodexCredential, right: OpenAICodexCredential): boolean {
  return (
    left.access === right.access &&
    left.refresh === right.refresh &&
    left.expires === right.expires &&
    getCodexCredentialAccountId(left) === getCodexCredentialAccountId(right)
  );
}

function formatCodexAccountSyncMessage(result: CodexAccountSyncResult): string {
  switch (result) {
    case 'different-account': {
      return 'Current Pi openai-codex auth is a different Codex account; active codexify account was not updated.';
    }
    case 'missing-active': {
      return 'No active codexify Codex account profile to sync.';
    }
    case 'missing-current': {
      return `No active ${CODEX_PROVIDER} OAuth credential. Use /login ${CODEX_PROVIDER} first.`;
    }
    case 'synced': {
      return 'Active codexify Codex account synced from current Pi auth.';
    }
    case 'unchanged': {
      return 'Active codexify Codex account is already in sync with current Pi auth.';
    }
  }
}

export function getCodexCredentialAccountId(credential: OpenAICodexCredential | undefined): string | undefined {
  return getCredentialAccountId(credential);
}

function normalizeAccountName(name: string | undefined): string | undefined {
  const trimmed = name?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function requireAccountName(name: string): string {
  const accountName = normalizeAccountName(name);
  if (!accountName) throw new Error('Missing Codex account name.');
  if (!/^[a-zA-Z0-9._-]+$/.test(accountName)) {
    throw new Error('Codex account names may only contain letters, numbers, dots, underscores, and dashes.');
  }
  return accountName;
}

function requireActiveAccountName(profiles: CodexAccountProfiles): string {
  if (profiles.active && profiles.accounts[profiles.active]) return profiles.active;
  throw new Error('Missing Codex account name and no active Codex account profile.');
}

async function loadProfiles(profilePath = DEFAULT_PROFILE_PATH): Promise<CodexAccountProfiles> {
  try {
    const raw = await fs.readFile(profilePath, 'utf8');
    return normalizeProfiles(JSON.parse(raw));
  } catch (error) {
    if (isNotFoundError(error)) return { accounts: {} };
    throw error;
  }
}

function normalizeProfiles(value: unknown): CodexAccountProfiles {
  if (!isRecord(value)) return { accounts: {} };

  const accounts = isRecord(value.accounts) ? value.accounts : {};
  const normalizedAccounts: Record<string, OpenAICodexCredential> = {};

  for (const [name, credential] of Object.entries(accounts)) {
    if (isOpenAICodexCredential(credential)) normalizedAccounts[name] = credential;
  }

  const active = typeof value.active === 'string' && normalizedAccounts[value.active] ? value.active : undefined;
  return { active, accounts: normalizedAccounts };
}

async function saveProfiles(profiles: CodexAccountProfiles, profilePath = DEFAULT_PROFILE_PATH): Promise<void> {
  await fs.mkdir(path.dirname(profilePath), { recursive: true });
  await fs.writeFile(profilePath, `${JSON.stringify(profiles, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  });
  await fs.chmod(profilePath, 0o600);
}

function isNotFoundError(error: unknown): boolean {
  return isRecord(error) && error.code === 'ENOENT';
}
