import type { ExtensionContext, ExtensionEvent } from '@earendil-works/pi-coding-agent';
import { defaultAccount, type Account } from '#src/accounts.js';
import { switchAccount, type AccountManager, type AccountSwitchAPI } from '#src/command.js';
import { createAccountThinking, type ThinkingSettingsReader } from '#src/thinking.js';

type ModelSelectEvent = Extract<ExtensionEvent, { type: 'model_select' }>;
type ModelIdentity = Pick<ModelSelectEvent['model'], 'id' | 'provider'>;
type CycleTarget = { model: ModelIdentity; thinkingLevel?: ReturnType<AccountSwitchAPI['getThinkingLevel']> };
type ModelEvent = Extract<ExtensionEvent, { type: 'model_select' | 'thinking_level_select' | 'session_start' }>;

export function createAccountModelHandler(
  pi: AccountSwitchAPI,
  manager: AccountManager,
  readThinkingSettings?: ThinkingSettingsReader
) {
  const thinking = createAccountThinking(pi, readThinkingSettings);
  const selected = new Map<string, Account>();
  const pending = new Set<ModelIdentity>();
  const accountFor = (provider: string) =>
    manager.list().find((account) => account.provider === provider) ?? defaultAccount(provider);
  const remember = (model: ModelIdentity | undefined) => {
    if (!model) return;
    const account = accountFor(model.provider);
    selected.set(account.baseProvider, account);
  };
  const guardedPi: AccountSwitchAPI = {
    getThinkingLevel: () => pi.getThinkingLevel(),
    setThinkingLevel: (level) => {
      pi.setThinkingLevel(level);
    },
    setModel: async (model) => {
      pending.add(model);
      try {
        return await pi.setModel(model);
      } finally {
        pending.delete(model);
      }
    },
  };

  const selectModel = async (
    event: ModelSelectEvent,
    ctx: ExtensionContext,
    previousThinkingLevel: ReturnType<AccountSwitchAPI['getThinkingLevel']> | undefined
  ): Promise<void> => {
    if (event.source === 'restore') {
      selected.clear();
      thinking.reset(ctx);
      remember(event.model);
      return;
    }
    remember(event.previousModel);
    const target: CycleTarget = event.source === 'cycle' ? cycleTarget(event, ctx, accountFor) : { model: event.model };
    const targetAccount = accountFor(target.model.provider);
    const account = isExplicitAccountSelection(event, targetAccount)
      ? targetAccount
      : (selected.get(targetAccount.baseProvider) ?? targetAccount);
    const thinkingLevel = thinking.resolve(account, target, ctx);
    if (sameModel(ctx.model, { provider: account.provider, id: target.model.id })) {
      remember(ctx.model);
      thinking.apply(thinkingLevel);
      return;
    }
    try {
      if (await switchAccount(guardedPi, account, ctx, target.model.id)) {
        selected.set(account.baseProvider, account);
        thinking.apply(thinkingLevel);
      } else {
        await restorePreviousModel(guardedPi, event, ctx, previousThinkingLevel);
      }
    } catch (error) {
      await restorePreviousModel(guardedPi, event, ctx, previousThinkingLevel);
      throw error;
    }
  };

  return async (event: ModelEvent, ctx: ExtensionContext): Promise<void> => {
    if (event.type === 'session_start') {
      selected.clear();
      thinking.reset(ctx);
      return;
    }
    if (event.type === 'thinking_level_select') {
      thinking.observe(event, ctx);
      return;
    }
    if (pending.has(event.model)) return;
    const previousLevel = thinking.begin(event.previousModel);
    try {
      await selectModel(event, ctx, previousLevel);
    } finally {
      thinking.end(ctx);
    }
  };
}

function isExplicitAccountSelection(event: ModelSelectEvent, account: Account): boolean {
  return (
    event.source === 'set' && (event.model.id === event.previousModel?.id || account.provider !== account.baseProvider)
  );
}

function cycleTarget(
  event: ModelSelectEvent,
  ctx: ExtensionContext,
  accountFor: (provider: string) => Account
): CycleTarget {
  const available = ctx.modelRegistry.getAvailable();
  const availableKeys = new Set(available.map((model) => modelKey(model)));
  const scoped = ctx.scopedModels;
  const raw =
    scoped.length > 0
      ? scoped.filter((entry) => availableKeys.has(modelKey(entry.model)))
      : available.map((model) => ({ model }));
  const nextIndex = raw.findIndex((entry) => sameModel(entry.model, event.model));
  if (raw.length < 2 || nextIndex === -1) return { model: event.model };
  const previousIndex = Math.max(
    0,
    raw.findIndex((entry) => sameModel(entry.model, event.previousModel))
  );
  const direction = nextIndex === (previousIndex + 1) % raw.length ? 1 : -1;
  const logicalKey = (model: ModelIdentity) =>
    modelKey({ ...model, provider: accountFor(model.provider).baseProvider });
  const unique = new Map<string, CycleTarget>();
  for (const entry of raw) {
    const key = logicalKey(entry.model);
    if (!unique.has(key)) unique.set(key, entry);
  }
  const models = [...unique.values()];
  const previousKey = event.previousModel ? logicalKey(event.previousModel) : undefined;
  const currentIndex = Math.max(
    0,
    models.findIndex((entry) => logicalKey(entry.model) === previousKey)
  );
  return models[(currentIndex + direction + models.length) % models.length] ?? { model: event.model };
}

async function restorePreviousModel(
  pi: AccountSwitchAPI,
  event: ModelSelectEvent,
  ctx: ExtensionContext,
  thinkingLevel: ReturnType<AccountSwitchAPI['getThinkingLevel']> | undefined
): Promise<void> {
  if (!event.previousModel || !sameModel(ctx.model, event.model)) return;
  if (!(await pi.setModel(event.previousModel))) return;
  if (thinkingLevel !== undefined) pi.setThinkingLevel(thinkingLevel);
}

function sameModel(left: ModelIdentity | undefined, right: ModelIdentity | undefined): boolean {
  return left?.id === right?.id && left?.provider === right?.provider;
}

function modelKey(model: ModelIdentity): string {
  return `${model.provider}\0${model.id}`;
}
