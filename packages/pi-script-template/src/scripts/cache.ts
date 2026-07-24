import type { ExecutionConfig } from '#src/config/schema.js';
import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';
import { runTemplateScript } from '#src/scripts/runner.js';
import type { TemplateScript } from '#src/scripts/types.js';

export interface ScriptOutputCacheOptions {
  execution: ExecutionConfig;
  scripts: ReadonlyMap<string, TemplateScript>;
  workspaceCwd: string;
  onDiagnostic?: (diagnostic: ScriptTemplateDiagnostic) => void;
}

export class ScriptOutputCache {
  private readonly diagnostics: ScriptTemplateDiagnostic[] = [];
  private readonly outputs = new Map<string, string>();

  constructor(private readonly options: ScriptOutputCacheOptions) {}

  getOutput(name: string): string | undefined {
    const cached = this.outputs.get(name);
    if (cached !== undefined) return cached;

    const script = this.options.scripts.get(name);
    if (!script) return undefined;

    const result = runTemplateScript({
      execution: this.options.execution,
      workspaceCwd: this.options.workspaceCwd,
      script,
    });
    this.outputs.set(name, result.output);
    this.diagnostics.push(...result.diagnostics);
    for (const diagnostic of result.diagnostics) this.options.onDiagnostic?.(diagnostic);
    return result.output;
  }

  getDiagnostics(): ScriptTemplateDiagnostic[] {
    return [...this.diagnostics];
  }
}
