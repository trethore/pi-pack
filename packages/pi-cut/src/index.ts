import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { loadConfig } from '#src/config/config.js';
import { registerDuplicateLineFolding } from '#src/features/duplicate-line-folding/index.js';
import { registerLineTruncation } from '#src/features/line-truncation/index.js';
import { registerTerminalCleanup } from '#src/features/terminal-cleanup/index.js';

export default function piCut(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerTerminalCleanup(pi, loadedConfig.config.enabled, loadedConfig.config.terminalCleanup);
  registerDuplicateLineFolding(
    pi,
    loadedConfig.config.enabled,
    loadedConfig.config.duplicateLineFolding
  );
  registerLineTruncation(pi, loadedConfig.config.enabled, loadedConfig.config.lineTruncation);
}

function registerConfigDiagnostics(pi: ExtensionAPI, errors: string[]) {
  if (errors.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    for (const error of errors) {
      ctx.ui.notify(error, 'warning');
    }
  });
}
