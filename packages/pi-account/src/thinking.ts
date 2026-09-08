import {
  getAgentDir,
  SettingsManager,
  type ExtensionContext,
  type ExtensionEvent,
} from '@earendil-works/pi-coding-agent';
import type { Account } from '#src/accounts.js';
import type { AccountSwitchAPI } from '#src/command.js';

type ThinkingLevel = ReturnType<AccountSwitchAPI['getThinkingLevel']>;
type ModelIdentity = { provider: string; id: string };
type ThinkingEvent = Extract<ExtensionEvent, { type: 'thinking_level_select' }>;
type ThinkingSettings = Pick<SettingsManager, 'getModelThinkingLevel' | 'getDefaultThinkingLevel'>;
export type ThinkingSettingsReader = (ctx: ExtensionContext) => ThinkingSettings;
const DEFAULT_THINKING_LEVEL: ThinkingLevel = 'medium';

export function createAccountThinking(pi: AccountSwitchAPI, readSettings: ThinkingSettingsReader = loadSettings) {
  let activeModel: ModelIdentity | undefined;
  let activeLevel: ThinkingLevel | undefined;
  let switching = 0;
  const capture = (ctx: ExtensionContext) => {
    activeModel = ctx.model;
    activeLevel = pi.getThinkingLevel();
  };

  return {
    reset(ctx: ExtensionContext): void {
      capture(ctx);
    },
    observe(event: ThinkingEvent, ctx: ExtensionContext): void {
      if (switching > 0 || !activeModel || !sameModel(activeModel, ctx.model)) return;
      activeLevel = event.level;
    },
    begin(previousModel: ModelIdentity | undefined): ThinkingLevel | undefined {
      switching++;
      return sameModel(activeModel, previousModel) ? activeLevel : undefined;
    },
    end(ctx: ExtensionContext): void {
      switching--;
      capture(ctx);
    },
    resolve(
      account: Account,
      target: { model: ModelIdentity; thinkingLevel?: ThinkingLevel },
      ctx: ExtensionContext
    ): ThinkingLevel {
      if (target.thinkingLevel !== undefined) return target.thinkingLevel;
      const settings = readSettings(ctx);
      return (
        settings.getModelThinkingLevel(account.provider, target.model.id) ??
        settings.getModelThinkingLevel(account.baseProvider, target.model.id) ??
        settings.getDefaultThinkingLevel() ??
        DEFAULT_THINKING_LEVEL
      );
    },
    apply(level: ThinkingLevel | undefined): void {
      if (level !== undefined && level !== pi.getThinkingLevel()) pi.setThinkingLevel(level);
    },
  };
}

function loadSettings(ctx: ExtensionContext): ThinkingSettings {
  return SettingsManager.create(ctx.cwd, getAgentDir(), { projectTrusted: ctx.isProjectTrusted() });
}

function sameModel(left: ModelIdentity | undefined, right: ModelIdentity | undefined): boolean {
  return left?.provider === right?.provider && left?.id === right?.id;
}
