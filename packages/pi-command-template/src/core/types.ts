import type { PiCommandTemplateConfig } from '#src/config/schema.js';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';

export type RenderSurface =
  | 'system'
  | 'appendSystem'
  | 'contextFiles'
  | 'promptTemplates'
  | 'skills'
  | 'skillInvocation';

export interface CommandTemplateRenderer {
  render(content: string): string;
  getDiagnostics(): CommandDiagnostic[];
}

export interface CommandRunnerOptions {
  config: PiCommandTemplateConfig;
  workspaceCwd: string;
  extensionCwd: string;
  onDiagnostic?: (diagnostic: CommandDiagnostic) => void;
}
