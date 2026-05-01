import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { loadConfig } from '#src/config/config.js';
import { registerEfficiencyReminder } from '#src/features/efficiency-reminder/index.js';
import { registerToolResultPipeline } from '#src/features/tool-result-pipeline.js';

export default function piCut(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEfficiencyReminder(pi, loadedConfig.config);
  registerToolResultPipeline(pi, loadedConfig.config);
}

function registerConfigDiagnostics(pi: ExtensionAPI, errors: string[]) {
  if (errors.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    for (const error of errors) {
      ctx.ui.notify(error, 'warning');
    }
  });
}
