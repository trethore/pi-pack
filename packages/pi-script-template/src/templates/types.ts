import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';

export interface ScriptTemplateRenderer {
  render(content: string): string;
  getDiagnostics(): ScriptTemplateDiagnostic[];
}
