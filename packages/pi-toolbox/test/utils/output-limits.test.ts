import { readFileSync } from 'node:fs';
import path from 'node:path';

import { DEFAULT_MAX_LINES } from '@earendil-works/pi-coding-agent';
import { describe, expect, it } from 'vitest';
import { limitAndPersistToolOutput } from '#pi-toolbox/utils/output-limits.js';
import { trackTempDir } from '#test/utils/tool-test-helpers.js';

describe('limitAndPersistToolOutput', () => {
  it('returns output within the default Pi limits without persistence', async () => {
    await expect(limitAndPersistToolOutput('line one\nline two', 'test')).resolves.toEqual({
      text: 'line one\nline two',
    });
  });

  it('applies the default Pi line limit and persists the complete output', async () => {
    // Arrange
    const text = Array.from({ length: DEFAULT_MAX_LINES + 1 }, (_value, index) => `line ${index}`).join('\n');

    // Act
    const result = await limitAndPersistToolOutput(text, 'test');

    // Assert
    expect(result.details?.truncation?.truncatedBy).toBe('lines');
    const fullOutputPath = result.details?.fullOutputPath;
    expect(fullOutputPath).toBeDefined();
    if (!fullOutputPath) throw new Error('expected full output path');
    trackTempDir(path.dirname(fullOutputPath));
    expect(readFileSync(fullOutputPath, 'utf8')).toBe(text);
  });
});
