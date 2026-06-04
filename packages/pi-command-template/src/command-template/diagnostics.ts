import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

export function registerCommandTemplateDiagnostics(
  pi: ExtensionAPI,
  getDiagnostics: () => readonly string[]
): void {
  const reported = new Set<string>();

  const report = (ctx: ExtensionContext) => {
    for (const diagnostic of getDiagnostics()) {
      if (reported.has(diagnostic)) continue;
      reported.add(diagnostic);
      ctx.ui.notify(diagnostic, 'warning');
    }
  };

  pi.on('session_start', (_event, ctx) => report(ctx));
  pi.on('before_agent_start', (_event, ctx) => report(ctx));
}
