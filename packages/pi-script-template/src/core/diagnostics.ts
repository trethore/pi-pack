type ScriptTemplateDiagnosticSeverity = 'warning' | 'error';

export interface ScriptTemplateDiagnostic {
  severity: ScriptTemplateDiagnosticSeverity;
  template?: string;
  message: string;
}
