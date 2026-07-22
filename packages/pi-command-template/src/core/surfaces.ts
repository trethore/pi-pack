import type { SurfaceConfig, TemplateSurface } from '#src/config/schema.js';

export const templateSurfaceByRenderSurface = {
  system: 'system',
  appendSystem: 'appendSystem',
  contextFiles: 'contextFiles',
  promptTemplates: 'promptTemplates',
  skills: 'skills',
  skillInvocation: 'skills',
} as const satisfies Record<string, TemplateSurface>;

export type RenderSurface = keyof typeof templateSurfaceByRenderSurface;

export function isRenderSurfaceEnabled(surfaces: SurfaceConfig, surface: RenderSurface): boolean {
  return surfaces[templateSurfaceByRenderSurface[surface]];
}
