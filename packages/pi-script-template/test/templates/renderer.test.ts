import { describe, expect, it } from 'vitest';
import { renderScriptTemplates } from '#src/templates/renderer.js';

describe('renderScriptTemplates', () => {
  it('replaces known templates and preserves unknown placeholders', () => {
    // Arrange
    const outputs: Record<string, string> = { platform: 'linux' };

    // Act
    const result = renderScriptTemplates('OS={{ platform }} missing={{missing}}', {
      getOutput: (name) => outputs[name],
    });

    // Assert
    expect(result).toBe('OS=linux missing={{missing}}');
  });
});
