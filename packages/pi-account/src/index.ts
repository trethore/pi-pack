import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/shared/error.js';
import { AccountStore } from '#src/accounts.js';
import { applyDefaultAccount, registerAccountCommand } from '#src/command.js';
import { createAccountManager } from '#src/manager.js';
import { createAccountModelHandler } from '#src/models.js';

export default function piAccount(pi: ExtensionAPI): void {
  const manager = createAccountManager(pi, new AccountStore(getAgentDir()));
  let selectModel = createAccountModelHandler(pi, manager);
  registerAccountCommand(pi, manager);
  const sync = async (ctx: ExtensionContext): Promise<void> => {
    selectModel = createAccountModelHandler(pi, manager);
    try {
      await manager.sync(ctx);
      await ctx.modelRegistry.refresh({ allowNetwork: false });
      await applyDefaultAccount(pi, manager, ctx);
    } catch (error) {
      ctx.ui.notify(`pi-account: ${getErrorMessage(error)}`, 'error');
    }
  };
  pi.on('session_start', async (event, ctx) => {
    await sync(ctx);
    await selectModel(event, ctx);
  });
  pi.on('thinking_level_select', (event, ctx) => selectModel(event, ctx));
  pi.on('model_select', async (event, ctx) => {
    try {
      await selectModel(event, ctx);
    } catch (error) {
      ctx.ui.notify(`pi-account: ${getErrorMessage(error)}`, 'error');
    }
  });
}
