import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';

export interface ScriptTemplateDiagnosticReporter {
  reportDiagnostic(diagnostic: ScriptTemplateDiagnostic): void;
}

export function registerScriptTemplateDiagnostics(
  pi: ExtensionAPI,
  getDiagnostics: () => readonly ScriptTemplateDiagnostic[]
): ScriptTemplateDiagnosticReporter {
  const reported = new Set<string>();
  let latestContext: ExtensionContext | undefined;

  const reportDiagnostic = (diagnostic: ScriptTemplateDiagnostic) => {
    if (!latestContext) return;
    if (reported.has(diagnostic.message)) return;
    reported.add(diagnostic.message);
    latestContext.ui.notify(diagnostic.message, diagnostic.severity);
  };

  const reportAll = (ctx: ExtensionContext) => {
    latestContext = ctx;
    for (const diagnostic of getDiagnostics()) reportDiagnostic(diagnostic);
  };

  pi.on('session_start', (_event, ctx) => reportAll(ctx));
  pi.on('before_agent_start', (_event, ctx) => reportAll(ctx));
  return { reportDiagnostic };
}
