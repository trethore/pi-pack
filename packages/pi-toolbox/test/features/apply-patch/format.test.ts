import { describe, expect, it } from 'vitest';

import { countApplyPatchSummary, formatApplyPatchSummary } from '#pi-toolbox/features/apply-patch/format.js';
import { lines } from '#test/utils/lines.js';

describe('apply_patch format', () => {
  it('formats summary output in add, modified, deleted order', () => {
    // Arrange
    const summary = {
      added: ['created.txt'],
      modified: ['modified.txt'],
      deleted: ['deleted.txt'],
    };

    // Act
    const formattedSummary = formatApplyPatchSummary(summary);
    const summaryCount = countApplyPatchSummary(summary);

    // Assert
    expect(formattedSummary).toBe(
      lines('Success. Updated the following files:', 'A created.txt', 'M modified.txt', 'D deleted.txt')
    );
    expect(summaryCount).toBe(3);
  });
});
