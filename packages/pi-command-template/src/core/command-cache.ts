import type { PiCommandTemplateConfig } from '#src/config/schema.js';
import { runTemplateCommand } from '#src/core/command-runner.js';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';
import type { RenderContext } from '#src/core/types.js';

export interface CommandCacheOptions {
  config: PiCommandTemplateConfig;
  workspaceCwd: string;
  extensionCwd: string;
  onDiagnostic?: (diagnostic: CommandDiagnostic) => void;
}

export class CommandCache {
  private readonly diagnostics: CommandDiagnostic[] = [];
  private readonly outputs = new Map<string, string>();

  constructor(private readonly options: CommandCacheOptions) {}

  getOutput(name: string, context?: RenderContext): string | undefined {
    const cached = this.outputs.get(name);
    if (cached !== undefined) return cached;

    const command = this.options.config.templates[name];
    if (command === undefined) return undefined;

    const result = runTemplateCommand({
      config: this.options.config,
      workspaceCwd: this.options.workspaceCwd,
      extensionCwd: this.options.extensionCwd,
      name,
      command,
      context,
    });
    this.outputs.set(name, result.output);
    this.diagnostics.push(...result.diagnostics);
    for (const diagnostic of result.diagnostics) this.options.onDiagnostic?.(diagnostic);
    return result.output;
  }

  getDiagnostics(): CommandDiagnostic[] {
    return [...this.diagnostics];
  }
}
