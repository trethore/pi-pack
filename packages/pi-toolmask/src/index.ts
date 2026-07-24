import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';

import { loadConfig } from '#src/config/config.js';
import type { PiToolmaskConfig } from '#src/config/schema.js';
import { applyToolmask, compileToolmask, type Toolmask, type ToolmaskResult } from '#src/core/toolmask.js';

export default function piToolmask(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerToolmask(pi, loadedConfig.config);
}

export function registerToolmask(pi: ExtensionAPI, config: PiToolmaskConfig): void {
  if (!config.enabled || config.masks.length === 0) return;

  const toolmask = compileToolmask(config.masks);
  const removedTools = new Set<string>();

  pi.on('session_start', (_event, ctx) => {
    applyAndNotify(pi, ctx, config.notify, toolmask, removedTools);
  });

  pi.on('session_shutdown', (event) => {
    if (event.reason !== 'reload') return;

    restoreRemovedTools(pi, removedTools);
  });

  if (config.enforceBeforeAgentStart) {
    pi.on('before_agent_start', (_event, ctx) => {
      applyAndNotify(pi, ctx, config.notify, toolmask, removedTools);
    });
  }
}

function applyAndNotify(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'setActiveTools'>,
  ctx: ExtensionContext,
  notify: boolean,
  toolmask: Toolmask,
  removedTools: Set<string>
): void {
  const result = applyToolmask(pi, toolmask);

  for (const toolName of result.maskedTools) {
    removedTools.add(toolName);
  }

  notifyToolmaskResult(ctx, notify, result);
}

function restoreRemovedTools(
  pi: Pick<ExtensionAPI, 'getActiveTools' | 'setActiveTools'>,
  removedTools: ReadonlySet<string>
): void {
  const activeTools = pi.getActiveTools();
  const restoredTools = [...activeTools];
  const restoredToolNames = new Set(activeTools);

  for (const toolName of removedTools) {
    if (restoredToolNames.has(toolName)) continue;

    restoredTools.push(toolName);
    restoredToolNames.add(toolName);
  }

  if (restoredTools.length > activeTools.length) {
    pi.setActiveTools(restoredTools);
  }
}

function notifyToolmaskResult(ctx: ExtensionContext, notify: boolean, result: ToolmaskResult): void {
  if (!notify || !result.changed) return;

  ctx.ui.notify(`pi-toolmask disabled tools: ${result.maskedTools.join(', ')}`, 'info');
}
