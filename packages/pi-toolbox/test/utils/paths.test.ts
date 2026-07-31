import { describe, expect, it } from 'vitest';

import { normalizeToolPath } from '#pi-toolbox/utils/paths.js';

describe('path utilities', () => {
  it('normalizes model-provided paths', () => {
    expect(normalizeToolPath('  @src/index.ts  ')).toBe('src/index.ts');
    expect(normalizeToolPath('src/index.ts')).toBe('src/index.ts');
  });
});
