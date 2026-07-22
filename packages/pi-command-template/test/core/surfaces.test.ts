import { describe, expect, it } from 'vitest';
import type { SurfaceConfig } from '#src/config/schema.js';
import { isRenderSurfaceEnabled, templateSurfaceByRenderSurface } from '#src/core/surfaces.js';

describe('render surfaces', () => {
  it('maps render surfaces to configuration surfaces', () => {
    // Act
    const mapping = templateSurfaceByRenderSurface;

    // Assert
    expect(mapping).toEqual({
      system: 'system',
      appendSystem: 'appendSystem',
      contextFiles: 'contextFiles',
      promptTemplates: 'promptTemplates',
      skills: 'skills',
      skillInvocation: 'skills',
    });
  });

  it('uses the skills setting for metadata and explicit invocations', () => {
    // Arrange
    const surfaces: SurfaceConfig = {
      system: false,
      appendSystem: false,
      contextFiles: false,
      promptTemplates: false,
      skills: true,
    };

    // Act
    const metadataEnabled = isRenderSurfaceEnabled(surfaces, 'skills');
    const invocationEnabled = isRenderSurfaceEnabled(surfaces, 'skillInvocation');

    // Assert
    expect(metadataEnabled).toBe(true);
    expect(invocationEnabled).toBe(true);
  });
});
