import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { accountForProvider, type Account } from '#src/accounts.js';
import type { AccountManager } from '#src/manager.js';

export type AccountSwitchAPI = Pick<ExtensionAPI, 'setModel' | 'getThinkingLevel' | 'setThinkingLevel'>;

export async function applyDefaultAccount(
  pi: AccountSwitchAPI,
  manager: AccountManager,
  ctx: ExtensionContext
): Promise<void> {
  if (!ctx.model) return;
  const { baseProvider } = accountForProvider(manager.list(), ctx.model.provider);
  const account = await manager.store.getDefault(baseProvider);
  if (account) await switchAccount(pi, account, ctx);
}

export async function switchAccount(
  pi: AccountSwitchAPI,
  account: Account,
  ctx: ExtensionContext,
  modelId = ctx.model?.id
): Promise<boolean> {
  const previousModel = ctx.model;
  if (!canSwitchAccount(account, ctx)) return false;
  if (isCurrentAccountModel(account, ctx, modelId)) return true;
  const result = await resolveAccountModel(account, ctx, modelId);
  if (!result.ok || ctx.model !== previousModel) return false;
  if (!ctx.isIdle()) {
    ctx.ui.notify('Wait for the current response to finish before changing accounts.', 'warning');
    return false;
  }
  const model = result.model;
  if (!model) {
    ctx.ui.notify(
      `The current model is not available for ${account.name}. Select a model under ${account.provider} with /model.`,
      'warning'
    );
    return false;
  }
  const thinkingLevel = pi.getThinkingLevel();
  if (!(await pi.setModel(model))) {
    promptLogin(account, ctx);
    return false;
  }
  pi.setThinkingLevel(thinkingLevel);
  return true;
}

function isCurrentAccountModel(account: Account, ctx: ExtensionContext, modelId: string | undefined): boolean {
  return ctx.model?.provider === account.provider && ctx.model.id === modelId;
}

function canSwitchAccount(account: Account, ctx: ExtensionContext): boolean {
  if (!ctx.isIdle()) {
    ctx.ui.notify('Wait for the current response to finish before changing accounts.', 'warning');
    return false;
  }
  if (!ctx.modelRegistry.getProvider(account.provider)) {
    ctx.ui.notify(
      `Provider for ${account.name} is unavailable. Load ${account.baseProvider} with a stored-credential login flow.`,
      'warning'
    );
    return false;
  }
  if (!ctx.modelRegistry.getProviderAuthStatus(account.provider).configured) {
    promptLogin(account, ctx);
    return false;
  }
  return true;
}

function findAccountModel(
  account: Account,
  ctx: ExtensionContext,
  modelId: string | undefined
): Model<Api> | undefined {
  return ctx.modelRegistry.getAvailable().find((model) => model.provider === account.provider && model.id === modelId);
}

async function resolveAccountModel(
  account: Account,
  ctx: ExtensionContext,
  modelId: string | undefined
): Promise<{ ok: true; model: Model<Api> | undefined } | { ok: false }> {
  const cached = findAccountModel(account, ctx, modelId);
  if (cached) return { ok: true, model: cached };
  const refreshed = await ctx.modelRegistry.refresh({ providers: [account.provider], allowNetwork: true });
  if (refreshed.aborted) return { ok: false };
  const error = refreshed.errors.get(account.provider);
  if (error) {
    ctx.ui.notify(`Could not refresh models for ${account.name}: ${error.message}`, 'warning');
    return { ok: false };
  }
  return { ok: true, model: findAccountModel(account, ctx, modelId) };
}

export function promptLogin(account: Account, ctx: ExtensionContext): void {
  const command = `/login ${account.provider}`;
  if (ctx.mode === 'tui' && !ctx.ui.getEditorText().trim()) ctx.ui.setEditorText(command);
  ctx.ui.notify(
    `Sign in with ${command}, then select ${account.name} with /account. Complete the provider login with the intended account or API key.`,
    'info'
  );
}
