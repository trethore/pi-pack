import { describe, expect, it } from 'vitest';

import { formatGlobResult } from '#pi-toolbox/features/glob/format.js';

describe('formatGlobResult', () => {
  it('formats files as a compact tree', () => {
    // Arrange
    const files = ['test/glob.test.ts', 'src/agent/tools.ts', 'src/index.ts', 'src/agent/glob.ts'];

    // Act
    const output = formatGlobResult({ base: '.', files });

    // Assert
    expect(output).toBe(`base=. count=4
src/
  index.ts
  agent/
    glob.ts
    tools.ts
test/
  glob.test.ts`);
  });

  it('formats empty results without extra tree lines', () => {
    expect(formatGlobResult({ base: '.', files: [] })).toBe('base=. count=0');
  });

  it('marks limited results', () => {
    expect(formatGlobResult({ base: '.', files: ['src/index.ts'], limited: true })).toBe(
      `base=. count=1 limited=true
src/
  index.ts`
    );
  });
});
