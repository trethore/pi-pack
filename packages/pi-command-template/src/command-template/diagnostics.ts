import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';

export interface CommandTemplateDiagnosticReporter {
  reportDiagnostic(diagnostic: CommandDiagnostic): void;
}

export function registerCommandTemplateDiagnostics(
  pi: ExtensionAPI,
  getDiagnostics: () => readonly CommandDiagnostic[]
): CommandTemplateDiagnosticReporter {
  const reported = new Set<string>();
  let latestContext: ExtensionContext | undefined;

  const reportDiagnostic = (diagnostic: CommandDiagnostic) => {
    if (!latestContext) return;

    const message = diagnostic.message;
    if (reported.has(message)) return;
    reported.add(message);
    latestContext.ui.notify(message, diagnostic.severity);
  };

  const reportAll = (ctx: ExtensionContext) => {
    latestContext = ctx;
    for (const diagnostic of getDiagnostics()) reportDiagnostic(diagnostic);
  };

  pi.on('session_start', (_event, ctx) => reportAll(ctx));
  pi.on('before_agent_start', (_event, ctx) => reportAll(ctx));

  return { reportDiagnostic };
}
