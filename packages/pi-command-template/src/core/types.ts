import type { PiCommandTemplateConfig } from '#src/config/schema.js';

export type RenderSurface =
  | 'system'
  | 'appendSystem'
  | 'contextFiles'
  | 'promptTemplates'
  | 'skills'
  | 'skillInvocation';

export interface RenderContext {
  surface: RenderSurface;
  path?: string;
}

export interface CommandTemplateRenderer {
  render(content: string, context: RenderContext): string;
  getDiagnostics(): string[];
}

export interface CommandRunnerOptions {
  config: PiCommandTemplateConfig;
  workspaceCwd: string;
  extensionCwd: string;
}
