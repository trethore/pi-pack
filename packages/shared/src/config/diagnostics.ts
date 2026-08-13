import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export function registerConfigDiagnostics(pi: ExtensionAPI, errors: readonly string[]): void {
  if (errors.length === 0) return;

  pi.on('session_start', (_event, ctx) => {
    for (const error of errors) {
      ctx.ui.notify(error, 'warning');
    }
  });
}
