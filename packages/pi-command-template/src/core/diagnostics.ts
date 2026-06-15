import type { RenderSurface } from '#src/core/types.js';

type CommandDiagnosticSeverity = 'warning' | 'error';

export interface CommandDiagnostic {
  severity: CommandDiagnosticSeverity;
  template?: string;
  surface?: RenderSurface;
  path?: string;
  message: string;
}

export function formatCommandDiagnostic(diagnostic: CommandDiagnostic): string {
  const location = formatDiagnosticLocation(diagnostic);
  return location ? `${diagnostic.message} (${location})` : diagnostic.message;
}

function formatDiagnosticLocation(diagnostic: CommandDiagnostic): string | undefined {
  const parts = [diagnostic.surface, diagnostic.path].filter((value) => value !== undefined);
  return parts.length === 0 ? undefined : parts.join(': ');
}
