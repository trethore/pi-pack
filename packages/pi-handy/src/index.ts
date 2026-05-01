import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { loadConfig } from '#src/config/config.js';
import { registerSwitchWorkspaceCommand } from '#src/features/switch-workspace/index.js';
import { registerThinkingLevelCommand } from '#src/features/thinking-level/index.js';

export default function piHandy(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);

  if (!loadedConfig.config.enabled) return;
  if (loadedConfig.config.thinkingLevel.enabled) registerThinkingLevelCommand(pi);
  if (loadedConfig.config.switchWorkspace.enabled) registerSwitchWorkspaceCommand(pi);
}

function registerConfigDiagnostics(pi: ExtensionAPI, errors: string[]) {
  if (errors.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    for (const error of errors) {
      ctx.ui.notify(error, 'warning');
    }
  });
}
