import { describe, expect, it } from 'vitest';
import type { SurfaceConfig } from '#src/config/schema.js';
import { isPiContentSurfaceEnabled, templateSurfaceByPiContentSurface } from '#src/templates/surfaces.js';

describe('Pi content surfaces', () => {
  it('maps shared surfaces to configuration surfaces', () => {
    // Arrange
    const expectedMapping = {
      systemPrompt: 'system',
      appendSystemPrompt: 'appendSystem',
      contextFile: 'contextFiles',
      promptTemplate: 'promptTemplates',
      skillDescription: 'skills',
      skillInvocation: 'skills',
    };

    // Act
    const mapping = templateSurfaceByPiContentSurface;

    // Assert
    expect(mapping).toEqual(expectedMapping);
  });

  it('uses the skills setting for descriptions and invocations', () => {
    // Arrange
    const surfaces: SurfaceConfig = {
      system: false,
      appendSystem: false,
      contextFiles: false,
      promptTemplates: false,
      skills: true,
    };

    // Act
    const descriptionEnabled = isPiContentSurfaceEnabled(surfaces, 'skillDescription');
    const invocationEnabled = isPiContentSurfaceEnabled(surfaces, 'skillInvocation');

    // Assert
    expect(descriptionEnabled).toBe(true);
    expect(invocationEnabled).toBe(true);
  });
});
