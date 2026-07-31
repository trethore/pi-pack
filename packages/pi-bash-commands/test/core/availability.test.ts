import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';

import { isBuiltInBashAvailable } from '#pi-bash-commands/core/availability.js';

describe('isBuiltInBashAvailable', () => {
  it.each([
    { active: ['read'], source: 'builtin', expected: false },
    { active: ['bash'], source: undefined, expected: false },
    { active: ['bash'], source: 'extension', expected: false },
    { active: ['bash'], source: 'builtin', expected: true },
  ])('returns $expected for active=$active source=$source', ({ active, source, expected }) => {
    // Arrange
    const pi = {
      getActiveTools: () => active,
      getAllTools: () =>
        source
          ? [
              {
                name: 'bash',
                description: '',
                parameters: {},
                sourceInfo: { path: '', source, scope: 'temporary', origin: 'top-level' },
              },
            ]
          : [],
    } as unknown as Pick<ExtensionAPI, 'getActiveTools' | 'getAllTools'>;

    // Act
    const available = isBuiltInBashAvailable(pi);

    // Assert
    expect(available).toBe(expected);
  });
});
