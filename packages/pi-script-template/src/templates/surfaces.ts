import type { PiContentSurface } from '@trethore/pi-shared/unsafe/content-transform.js';
import type { SurfaceConfig, TemplateSurface } from '#src/config/schema.js';

export const templateSurfaceByPiContentSurface = {
  systemPrompt: 'system',
  appendSystemPrompt: 'appendSystem',
  contextFile: 'contextFiles',
  promptTemplate: 'promptTemplates',
  skillDescription: 'skills',
  skillInvocation: 'skills',
} as const satisfies Record<PiContentSurface, TemplateSurface>;

export function isPiContentSurfaceEnabled(surfaces: SurfaceConfig, surface: PiContentSurface): boolean {
  return surfaces[templateSurfaceByPiContentSurface[surface]];
}
