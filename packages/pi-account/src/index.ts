import { getAgentDir, type ExtensionAPI, type ExtensionContext } from '@earendil-works/pi-coding-agent';
import { getErrorMessage } from '@trethore/shared/error.js';
import { AccountStore } from '#src/accounts.js';
import { registerAccountCommand } from '#src/command.js';
import { createAccountManager } from '#src/manager.js';

export default function piAccount(pi: ExtensionAPI): void {
  const manager = createAccountManager(pi, new AccountStore(getAgentDir()));
  registerAccountCommand(pi, manager);
  const sync = async (ctx: ExtensionContext): Promise<void> => {
    try {
      await manager.sync(ctx);
      await ctx.modelRegistry.refresh({ allowNetwork: false });
    } catch (error) {
      ctx.ui.notify(`pi-account: ${getErrorMessage(error)}`, 'error');
    }
  };
  pi.on('session_start', (_event, ctx) => sync(ctx));
}
