import type { Api, Model } from '@earendil-works/pi-ai';
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { SelectItem } from '@earendil-works/pi-tui';
import { getErrorMessage } from '@trethore/shared/error.js';
import { defaultAccount, type Account, type AccountStore } from '#src/accounts.js';
import { supportsAccounts } from '#src/provider.js';
import { AccountSelector } from '#src/selector.js';

const ADD_ACCOUNT = 'add';

export interface AccountManager {
  store: Pick<AccountStore, 'add'>;
  sync(ctx: Pick<ExtensionContext, 'modelRegistry'>): Promise<Account[]>;
  list(): Account[];
}

export function registerAccountCommand(pi: ExtensionAPI, manager: AccountManager): void {
  pi.registerCommand('account', {
    description: 'Switch saved provider accounts in this session, or add <name> [provider]',
    getArgumentCompletions: (prefix) =>
      [ADD_ACCOUNT, 'default', ...manager.list().map((account) => account.name)]
        .filter((name) => name.startsWith(prefix.trim().toLowerCase()))
        .map((name) => ({ value: name, label: name })),
    handler: async (args, ctx) => {
      try {
        await handleAccountCommand(pi, manager, args.trim(), ctx);
      } catch (error) {
        ctx.ui.notify(`pi-account: ${getErrorMessage(error)}`, 'error');
      }
    },
  });
}

export async function handleAccountCommand(
  pi: Pick<ExtensionAPI, 'setModel' | 'getThinkingLevel' | 'setThinkingLevel'>,
  manager: AccountManager,
  args: string,
  ctx: ExtensionCommandContext
): Promise<void> {
  if (!ctx.isIdle()) {
    ctx.ui.notify('Wait for the current response to finish before changing accounts.', 'warning');
    return;
  }
  const saved = await manager.sync(ctx);
  const currentProvider = currentBaseProvider(saved, ctx);
  const accounts = listedAccounts(saved, currentProvider);
  if (args === ADD_ACCOUNT || args.startsWith(`${ADD_ACCOUNT} `)) {
    await addAccount(manager, args.slice(ADD_ACCOUNT.length).trim(), currentProvider, ctx);
    return;
  }
  await ctx.modelRegistry.refresh({ allowNetwork: false });
  if (args) {
    const account = resolveAccount(args, accounts, currentProvider);
    if (account) await switchAccount(pi, account, ctx);
    else ctx.ui.notify(`Unknown account "${args}". Use /account add <name> [provider].`, 'warning');
    return;
  }
  const selected = await selectAccount(accounts, ctx);
  if (selected === ADD_ACCOUNT) {
    await addAccount(manager, '', currentProvider, ctx);
    return;
  }
  const account = accounts.find((entry) => entry.provider === selected);
  if (account) await switchAccount(pi, account, ctx);
}

function currentBaseProvider(accounts: Account[], ctx: Pick<ExtensionCommandContext, 'model'>): string | undefined {
  return accounts.find((account) => account.provider === ctx.model?.provider)?.baseProvider ?? ctx.model?.provider;
}

function listedAccounts(saved: Account[], currentProvider: string | undefined): Account[] {
  const providers = new Set(saved.map((account) => account.baseProvider));
  if (currentProvider) providers.add(currentProvider);
  return [...[...providers].map((provider) => defaultAccount(provider)), ...saved];
}

function resolveAccount(args: string, accounts: Account[], currentProvider: string | undefined): Account | undefined {
  const [name, provider, extra] = args.split(/\s+/);
  if (extra) return undefined;
  if (name?.toLowerCase() === 'default') {
    const baseProvider = provider ?? currentProvider;
    return baseProvider ? defaultAccount(baseProvider) : undefined;
  }
  if (provider) return undefined;
  return accounts.find((account) => account.name === name?.toLowerCase());
}

async function addAccount(
  manager: AccountManager,
  args: string,
  currentProvider: string | undefined,
  ctx: ExtensionCommandContext
): Promise<void> {
  const [name, explicitProvider, extra] = args.split(/\s+/);
  if (extra) throw new Error('Use /account add <name> [provider].');
  const input = name || (ctx.hasUI ? await ctx.ui.input('Account name', 'personal or work') : undefined);
  if (!input) return;
  const baseProvider = explicitProvider ?? currentProvider;
  if (!baseProvider) throw new Error('Select a model first, or use /account add <name> <provider>.');
  validateBaseProvider(baseProvider, manager, ctx);
  if (!ctx.isIdle()) throw new Error('Wait for the current response to finish before adding accounts.');
  const account = await manager.store.add(input, baseProvider);
  await manager.sync(ctx);
  promptLogin(account, ctx);
}

function validateBaseProvider(baseProvider: string, manager: AccountManager, ctx: ExtensionCommandContext): void {
  const base = ctx.modelRegistry.getProvider(baseProvider);
  if (!base) throw new Error(`Provider "${baseProvider}" is not loaded.`);
  if (manager.list().some((account) => account.provider === baseProvider)) {
    throw new Error('Use the original provider ID, not an account alias.');
  }
  if (!supportsAccounts(base)) throw new Error(`${base.name} does not expose a stored-credential login flow.`);
}

export function accountItems(
  accounts: Account[],
  ctx: Pick<ExtensionCommandContext, 'model' | 'modelRegistry'>
): SelectItem[] {
  return accounts.map((account) => ({
    value: account.provider,
    label: `${ctx.model?.provider === account.provider ? '* ' : '  '}${account.name}`,
    description: accountDescription(account, ctx),
  }));
}

function accountDescription(account: Account, ctx: Pick<ExtensionCommandContext, 'modelRegistry'>): string {
  const base = ctx.modelRegistry.getProvider(account.baseProvider);
  if (!base) return `${account.baseProvider} (provider not loaded)`;
  const configured = ctx.modelRegistry.getProviderAuthStatus(account.provider).configured;
  return `${base.name}${configured ? '' : ' (login required)'}`;
}

async function selectAccount(accounts: Account[], ctx: ExtensionCommandContext): Promise<string | undefined> {
  if (ctx.mode !== 'tui') {
    ctx.ui.notify('Use /account <name> to switch accounts outside the terminal UI.', 'info');
    return undefined;
  }
  const items = [
    ...accountItems(accounts, ctx),
    { value: ADD_ACCOUNT, label: '+ Add account', description: 'Save another login for the current provider' },
  ];
  return ctx.ui.custom<string | undefined>(
    (_tui, theme, _keys, done) => new AccountSelector(items, ctx.model?.provider, theme, done)
  );
}

export async function switchAccount(
  pi: Pick<ExtensionAPI, 'setModel' | 'getThinkingLevel' | 'setThinkingLevel'>,
  account: Account,
  ctx: ExtensionCommandContext
): Promise<void> {
  if (!ctx.isIdle()) {
    ctx.ui.notify('Wait for the current response to finish before changing accounts.', 'warning');
    return;
  }
  if (!ctx.modelRegistry.getProvider(account.provider)) {
    ctx.ui.notify(
      `Provider for ${account.name} is unavailable. Load ${account.baseProvider} with a stored-credential login flow.`,
      'warning'
    );
    return;
  }
  if (!ctx.modelRegistry.getProviderAuthStatus(account.provider).configured) {
    promptLogin(account, ctx);
    return;
  }
  if (ctx.model?.provider === account.provider) return;
  const result = await resolveAccountModel(account, ctx);
  if (!result.ok) return;
  if (!ctx.isIdle()) {
    ctx.ui.notify('Wait for the current response to finish before changing accounts.', 'warning');
    return;
  }
  const model = result.model;
  if (!model) {
    ctx.ui.notify(
      `The current model is not available for ${account.name}. Select a model under ${account.provider} with /model.`,
      'warning'
    );
    return;
  }
  const thinkingLevel = pi.getThinkingLevel();
  if (!(await pi.setModel(model))) {
    promptLogin(account, ctx);
    return;
  }
  pi.setThinkingLevel(thinkingLevel);
}

function findAccountModel(account: Account, ctx: ExtensionCommandContext): Model<Api> | undefined {
  return ctx.modelRegistry
    .getAvailable()
    .find((model) => model.provider === account.provider && model.id === ctx.model?.id);
}

async function resolveAccountModel(
  account: Account,
  ctx: ExtensionCommandContext
): Promise<{ ok: true; model: Model<Api> | undefined } | { ok: false }> {
  const cached = findAccountModel(account, ctx);
  if (cached) return { ok: true, model: cached };
  const refreshed = await ctx.modelRegistry.refresh({ providers: [account.provider], allowNetwork: true });
  if (refreshed.aborted) return { ok: false };
  const error = refreshed.errors.get(account.provider);
  if (error) {
    ctx.ui.notify(`Could not refresh models for ${account.name}: ${error.message}`, 'warning');
    return { ok: false };
  }
  return { ok: true, model: findAccountModel(account, ctx) };
}

function promptLogin(account: Account, ctx: ExtensionCommandContext): void {
  const command = `/login ${account.provider}`;
  if (ctx.mode === 'tui' && !ctx.ui.getEditorText().trim()) ctx.ui.setEditorText(command);
  ctx.ui.notify(
    `Sign in with ${command}, then select ${account.name} with /account. Complete the provider login with the intended account or API key.`,
    'info'
  );
}
