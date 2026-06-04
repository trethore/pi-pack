import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import type { PiCommandTemplateConfig } from '#src/config/schema.js';
import { createCommandTemplateRenderer } from '#src/core/render-template.js';
import type { RenderSurface } from '#src/core/types.js';
import { registerCommandTemplateDiagnostics } from '#src/command-template/diagnostics.js';
import { installUnsafePiCommandTemplatePatch } from '#src/unsafe/index.js';

export function registerCommandTemplate(pi: ExtensionAPI, config: PiCommandTemplateConfig): void {
  const renderer = createCommandTemplateRenderer({
    config,
    workspaceCwd: process.cwd(),
    extensionCwd: path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url)))),
  });
  const installResult = installUnsafePiCommandTemplatePatch(({ surface, content, path }) => {
    if (!isSurfaceEnabled(config, surface)) return content;
    return renderer.render(content, { surface, path });
  });
  const startupDiagnostics = [...installResult.warnings, ...installResult.errors];

  registerCommandTemplateDiagnostics(pi, () => [
    ...startupDiagnostics,
    ...renderer.getDiagnostics(),
  ]);
}

function isSurfaceEnabled(config: PiCommandTemplateConfig, surface: RenderSurface): boolean {
  if (surface === 'skillInvocation') return config.surfaces.skills;
  return config.surfaces[surface];
}
