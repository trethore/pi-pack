type CommandDiagnosticSeverity = 'warning' | 'error';

export interface CommandDiagnostic {
  severity: CommandDiagnosticSeverity;
  template?: string;
  message: string;
}
