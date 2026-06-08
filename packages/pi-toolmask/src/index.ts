import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';

import { loadConfig } from '#src/config/config.js';
import { applyToolmask, type ToolmaskResult } from '#src/core/toolmask.js';

export default function piToolmask(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());
  const { config } = loadedConfig;

  registerConfigDiagnostics(pi, loadedConfig.errors);

  if (!config.enabled || config.masks.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    const result = applyToolmask(pi, config);
    notifyToolmaskResult(ctx, config.notify, result);
  });

  if (config.enforceBeforeAgentStart) {
    pi.on('before_agent_start', (_event, ctx) => {
      const result = applyToolmask(pi, config);
      notifyToolmaskResult(ctx, config.notify, result);
    });
  }
}

function notifyToolmaskResult(ctx: ExtensionContext, notify: boolean, result: ToolmaskResult): void {
  if (!notify || !result.changed) return;

  ctx.ui.notify(`pi-toolmask disabled tools: ${result.maskedTools.join(', ')}`, 'info');
}
