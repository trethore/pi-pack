import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';

import { loadConfig } from '#src/config/config.js';
import type { PiToolmaskConfig } from '#src/config/schema.js';
import { applyToolmask, type ToolmaskResult } from '#src/core/toolmask.js';

export default function piToolmask(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());
  const { config } = loadedConfig;
  let activeToolsBeforeMask: string[] | undefined;

  registerConfigDiagnostics(pi, loadedConfig.errors);

  if (!config.enabled || config.masks.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    activeToolsBeforeMask ??= applyAndNotify(pi, ctx, config).activeToolsBeforeMask;
  });

  pi.on('session_shutdown', (event) => {
    if (event.reason !== 'reload' || !activeToolsBeforeMask) return;

    pi.setActiveTools(activeToolsBeforeMask);
  });

  if (config.enforceBeforeAgentStart) {
    pi.on('before_agent_start', (_event, ctx) => {
      activeToolsBeforeMask ??= applyAndNotify(pi, ctx, config).activeToolsBeforeMask;
    });
  }
}

function applyAndNotify(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'setActiveTools'>,
  ctx: ExtensionContext,
  config: PiToolmaskConfig
): { activeToolsBeforeMask?: string[] } {
  const result = applyToolmask(pi, config);
  notifyToolmaskResult(ctx, config.notify, result);

  return { activeToolsBeforeMask: result.changed ? result.activeTools : undefined };
}

function notifyToolmaskResult(ctx: ExtensionContext, notify: boolean, result: ToolmaskResult): void {
  if (!notify || !result.changed) return;

  ctx.ui.notify(`pi-toolmask disabled tools: ${result.maskedTools.join(', ')}`, 'info');
}
