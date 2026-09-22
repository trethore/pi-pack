import { describe, expect, it, vi } from 'vitest';
import { checkPiContentTransformCompatibility } from '@trethore/shared/unsafe/content-transform/compatibility.js';

const pi = vi.hoisted(() => ({ version: '' }));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  AgentSession: { prototype: {} },
  DefaultResourceLoader: { prototype: {} },
  get VERSION() {
    return pi.version;
  },
}));

describe('Pi content transform version compatibility', () => {
  it.each(['0.87.0', '0.87.1', '0.88.0', '0.99.0'])('accepts Pi %s', (version) => {
    // Arrange
    pi.version = version;

    // Act
    const compatibility = checkPiContentTransformCompatibility();

    // Assert
    expect(compatibility).toEqual({ warnings: [], errors: [] });
  });

  it.each(['0.84.0', '0.85.0', '0.85.1', '0.86.0', '0.86.1', '1.0.0', 'invalid'])(
    'warns about unsupported Pi %s',
    (version) => {
      // Arrange
      pi.version = version;

      // Act
      const compatibility = checkPiContentTransformCompatibility();

      // Assert
      expect(compatibility).toEqual({
        warnings: [`shared: Pi content transforms support Pi >=0.87.0 <1; current Pi version is ${version}.`],
        errors: [],
      });
    }
  );
});
