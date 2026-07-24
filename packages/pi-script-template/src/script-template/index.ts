import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerPiContentTransformer } from '@trethore/pi-shared/unsafe/content-transform.js';
import { getErrorMessage } from '@trethore/pi-shared/error.js';
import { loadConfig } from '#src/config/config.js';
import { surfaceNames, type PiScriptTemplateConfig } from '#src/config/schema.js';
import type { ScriptTemplateDiagnostic } from '#src/core/diagnostics.js';
import { registerScriptTemplateDiagnostics } from '#src/script-template/diagnostics.js';
import { discoverTemplateScripts } from '#src/scripts/discovery.js';
import type { ScriptScope, TemplateScript } from '#src/scripts/types.js';
import { createScriptTemplateRenderer } from '#src/templates/renderer.js';
import { isPiContentSurfaceEnabled } from '#src/templates/surfaces.js';
import type { ScriptTemplateRenderer } from '#src/templates/types.js';

const TRANSFORMER_ID = '@trethore/pi-script-template';

interface ScriptTemplateRuntime {
  config: PiScriptTemplateConfig;
  diagnostics: ScriptTemplateDiagnostic[];
  renderer: ScriptTemplateRenderer;
}

export function registerScriptTemplate(pi: ExtensionAPI, cwd: string): void {
  const integrationDiagnostics: ScriptTemplateDiagnostic[] = [];
  const transformDiagnostics = new Map<string, ScriptTemplateDiagnostic>();
  const runtimes = {
    global: new Map<string, ScriptTemplateRuntime>(),
    project: new Map<string, ScriptTemplateRuntime>(),
  } satisfies Record<ScriptScope, Map<string, ScriptTemplateRuntime>>;

  pi.on('session_start', (_event, ctx) => {
    getRuntime(ctx.cwd, ctx.isProjectTrusted());
  });
  const diagnosticReporter = registerScriptTemplateDiagnostics(pi, getDiagnostics);
  const installResult = registerPiContentTransformer(pi, {
    id: TRANSFORMER_ID,
    transform: (input) => {
      const runtime = getRuntime(input.workspaceCwd ?? cwd, input.projectTrusted === true);
      if (!runtime.config.enabled || !isPiContentSurfaceEnabled(runtime.config.surfaces, input.surface)) {
        return input.content;
      }
      return runtime.renderer.render(input.content);
    },
    onError: (error, input) => {
      const diagnostic = {
        severity: 'warning' as const,
        message: `pi-script-template failed to transform ${input.surface} content: ${getErrorMessage(error)}`,
      };
      transformDiagnostics.set(diagnostic.message, diagnostic);
      reportDiagnostic(diagnostic);
    },
  });
  integrationDiagnostics.push(
    ...installResult.warnings.map((message) => ({ severity: 'warning' as const, message })),
    ...installResult.errors.map((message) => ({ severity: 'error' as const, message }))
  );

  function getRuntime(workspaceCwd: string, includeProject: boolean): ScriptTemplateRuntime {
    const scope = includeProject ? 'project' : 'global';
    const scopedRuntimes = runtimes[scope];
    let runtime = scopedRuntimes.get(workspaceCwd);
    if (!runtime) {
      runtime = createRuntime(workspaceCwd, includeProject, reportDiagnostic);
      scopedRuntimes.set(workspaceCwd, runtime);
    }
    return runtime;
  }

  function getDiagnostics(): ScriptTemplateDiagnostic[] {
    const diagnostics = [...integrationDiagnostics, ...transformDiagnostics.values()];
    for (const scopedRuntimes of Object.values(runtimes)) {
      for (const runtime of scopedRuntimes.values()) {
        diagnostics.push(...runtime.diagnostics, ...runtime.renderer.getDiagnostics());
      }
    }
    return diagnostics;
  }

  function reportDiagnostic(diagnostic: ScriptTemplateDiagnostic): void {
    diagnosticReporter.reportDiagnostic(diagnostic);
  }
}

function createRuntime(
  cwd: string,
  includeProject: boolean,
  reportDiagnostic: (diagnostic: ScriptTemplateDiagnostic) => void
): ScriptTemplateRuntime {
  const loadedConfig = loadConfig(cwd, { includeProject });
  const diagnostics: ScriptTemplateDiagnostic[] = loadedConfig.errors.map((message) => ({
    severity: 'warning',
    message,
  }));
  let scripts = new Map<string, TemplateScript>();
  if (loadedConfig.config.enabled && surfaceNames.some((surface) => loadedConfig.config.surfaces[surface])) {
    const discovered = discoverTemplateScripts(cwd, { includeProject });
    scripts = discovered.scripts;
    diagnostics.push(...discovered.diagnostics);
  }
  return {
    config: loadedConfig.config,
    diagnostics,
    renderer: createScriptTemplateRenderer({
      execution: loadedConfig.config.execution,
      scripts,
      workspaceCwd: cwd,
      onDiagnostic: reportDiagnostic,
    }),
  };
}
