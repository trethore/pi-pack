import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { loadConfig } from '#src/config/config.js';
import { registerLineTruncation } from '#src/features/line-truncation/index.js';
import { registerRepetitionFolding } from '#src/features/repetition-folding/index.js';
import { registerTerminalCleanup } from '#src/features/terminal-cleanup/index.js';

export default function piCut(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerTerminalCleanup(pi, loadedConfig.config);
  registerRepetitionFolding(pi, loadedConfig.config);
  registerLineTruncation(pi, loadedConfig.config);
}

function registerConfigDiagnostics(pi: ExtensionAPI, errors: string[]) {
  if (errors.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    for (const error of errors) {
      ctx.ui.notify(error, 'warning');
    }
  });
}
