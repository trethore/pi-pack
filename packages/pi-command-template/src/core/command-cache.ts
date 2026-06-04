import type { PiCommandTemplateConfig } from '#src/config/schema.js';
import { runTemplateCommand } from '#src/core/command-runner.js';

export interface CommandCacheOptions {
  config: PiCommandTemplateConfig;
  workspaceCwd: string;
  extensionCwd: string;
}

export class CommandCache {
  private readonly diagnostics: string[] = [];
  private readonly outputs = new Map<string, string>();

  constructor(private readonly options: CommandCacheOptions) {}

  getOutput(name: string): string | undefined {
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
    });
    this.outputs.set(name, result.output);
    this.diagnostics.push(...result.diagnostics);
    return result.output;
  }

  getDiagnostics(): string[] {
    return [...this.diagnostics];
  }
}
