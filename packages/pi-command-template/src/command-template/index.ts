import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiCommandTemplateConfig } from '#src/config/schema.js';
import type { CommandDiagnostic } from '#src/core/diagnostics.js';
import { createCommandTemplateRenderer } from '#src/core/render-template.js';
import type { RenderSurface } from '#src/core/types.js';
import { registerCommandTemplateDiagnostics } from '#src/command-template/diagnostics.js';
import { installUnsafePiCommandTemplatePatch } from '#src/unsafe/index.js';

export function registerCommandTemplate(pi: ExtensionAPI, config: PiCommandTemplateConfig): void {
  const extensionCwd = getExtensionCwd();
  const renderer = createCommandTemplateRenderer({
    config,
    workspaceCwd: process.cwd(),
    extensionCwd,
    onDiagnostic: reportDiagnostic,
  });
  const installResult = installUnsafePiCommandTemplatePatch(
    extensionCwd,
    ({ surface, content, path }) => {
      if (!isSurfaceEnabled(config, surface)) return content;
      return renderer.render(content, { surface, path });
    }
  );
  const startupDiagnostics = [
    ...installResult.warnings.map((message) => createStartupDiagnostic(message, 'warning')),
    ...installResult.errors.map((message) => createStartupDiagnostic(message, 'error')),
  ];

  const reporter = registerCommandTemplateDiagnostics(pi, () => [
    ...startupDiagnostics,
    ...renderer.getDiagnostics(),
  ]);

  function reportDiagnostic(diagnostic: CommandDiagnostic): void {
    reporter.reportDiagnostic(diagnostic);
  }
}

export function getExtensionCwd(): string {
  return path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
}

function createStartupDiagnostic(
  message: string,
  severity: CommandDiagnostic['severity']
): CommandDiagnostic {
  return { severity, message };
}

function isSurfaceEnabled(config: PiCommandTemplateConfig, surface: RenderSurface): boolean {
  if (surface === 'skillInvocation') return config.surfaces.skills;
  return config.surfaces[surface];
}
