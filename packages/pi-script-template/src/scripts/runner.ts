import { spawnSync } from 'node:child_process';
import path from 'node:path';
import type { ExecutionConfig } from '#src/config/schema.js';
import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';
import type { TemplateScript } from '#src/scripts/types.js';

interface ScriptRunResult {
  output: string;
  diagnostics: ScriptTemplateDiagnostic[];
}

interface RunTemplateScriptOptions {
  execution: ExecutionConfig;
  workspaceCwd: string;
  script: TemplateScript;
}

export function runTemplateScript(options: RunTemplateScriptOptions): ScriptRunResult {
  const result = spawnSync(process.execPath, [options.script.filePath], {
    cwd: path.dirname(options.script.filePath),
    encoding: 'utf8',
    timeout: options.execution.timeoutMs,
    maxBuffer: Math.max(options.execution.maxOutputChars * 4, 1024),
    shell: false,
    env: {
      ...process.env,
      PI_SCRIPT_TEMPLATE_NAME: options.script.name,
      PI_SCRIPT_TEMPLATE_SCOPE: options.script.scope,
      PI_WORKSPACE_CWD: options.workspaceCwd,
    },
  });
  const diagnostics = createResultDiagnostics(options, result);
  const output = createResultOutput(options, result, diagnostics);
  return { output, diagnostics };
}

function createResultOutput(
  options: RunTemplateScriptOptions,
  result: ReturnType<typeof spawnSync>,
  diagnostics: ScriptTemplateDiagnostic[]
): string {
  const stdout = typeof result.stdout === 'string' ? trimOneTrailingLineEnding(result.stdout) : '';
  if (isScriptFailure(result)) return createScriptFailureOutput(options.script.name);
  if (stdout.length <= options.execution.maxOutputChars) return stdout;

  diagnostics.push(
    createScriptDiagnostic(options.script, `output truncated to ${options.execution.maxOutputChars} characters.`)
  );
  return stdout.slice(0, options.execution.maxOutputChars);
}

function createResultDiagnostics(
  options: RunTemplateScriptOptions,
  result: ReturnType<typeof spawnSync>
): ScriptTemplateDiagnostic[] {
  const diagnostics: ScriptTemplateDiagnostic[] = [];
  const stderr = typeof result.stderr === 'string' ? trimOneTrailingLineEnding(result.stderr) : '';
  const script = options.script;

  if (result.error) {
    diagnostics.push(createScriptDiagnostic(script, `failed: ${result.error.message}`));
  }
  if (result.status !== null && result.status !== 0) {
    diagnostics.push(createScriptDiagnostic(script, `exited with status ${result.status}.`));
  }
  if (result.signal) {
    diagnostics.push(createScriptDiagnostic(script, `terminated by signal ${result.signal}.`));
  }
  if (stderr) {
    diagnostics.push(createScriptDiagnostic(script, `wrote to stderr: ${truncateDiagnosticOutput(stderr, options)}`));
  }
  return diagnostics;
}

function isScriptFailure(result: ReturnType<typeof spawnSync>): boolean {
  return result.error !== undefined || (result.status !== null && result.status !== 0) || result.signal !== null;
}

function createScriptDiagnostic(script: TemplateScript, detail: string): ScriptTemplateDiagnostic {
  return {
    severity: 'warning',
    template: script.name,
    message: `pi-script-template script {{${script.name}}} ${detail}`,
  };
}

function createScriptFailureOutput(name: string): string {
  return `[pi-script-template error: {{${name}}}]`;
}

function trimOneTrailingLineEnding(value: string): string {
  return value.replace(/\r?\n$/, '');
}

function truncateDiagnosticOutput(value: string, options: RunTemplateScriptOptions): string {
  const limit = options.execution.maxOutputChars;
  return value.length <= limit ? value : `${value.slice(0, limit)}...`;
}
