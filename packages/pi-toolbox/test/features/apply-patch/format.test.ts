import { describe, expect, it } from 'vitest';

import { ApplyPatchFailure } from '#pi-toolbox/features/apply-patch/apply.js';
import {
  countApplyPatchSummary,
  formatApplyPatchFailure,
  formatApplyPatchSummary,
} from '#pi-toolbox/features/apply-patch/format.js';
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
    expect(formattedSummary).toBe(lines('Patch applied:', 'A created.txt', 'M modified.txt', 'D deleted.txt'));
    expect(summaryCount).toBe(3);
  });

  it('formats a failure after completed changes', () => {
    // Arrange
    const failure = new ApplyPatchFailure(
      { added: ['created.txt'], modified: ['modified.txt'], deleted: [] },
      { type: 'delete', path: 'deletex.txt' },
      new Error('Failed to delete file /workspace/deletex.txt')
    );

    // Act
    const formattedFailure = formatApplyPatchFailure(failure);

    // Assert
    expect(formattedFailure).toBe(
      lines(
        'Patch partially applied:',
        'A created.txt',
        'M modified.txt',
        '',
        'Failed to delete file deletex.txt: Failed to delete file /workspace/deletex.txt'
      )
    );
  });

  it('formats a failure before any changes', () => {
    // Arrange
    const failure = new ApplyPatchFailure(
      { added: [], modified: [], deleted: [] },
      { type: 'update', path: 'modified.txt', chunks: [] },
      new Error('Failed to find expected lines in /workspace/modified.txt:\nmissing line')
    );

    // Act
    const formattedFailure = formatApplyPatchFailure(failure);

    // Assert
    expect(formattedFailure).toBe(
      lines(
        'Patch failed:',
        'Failed to update file modified.txt: Failed to find expected lines in /workspace/modified.txt:',
        'missing line'
      )
    );
  });

  it('reports a written destination when removing the move source fails', () => {
    // Arrange
    const failure = new ApplyPatchFailure(
      { added: [], modified: [], deleted: [] },
      { type: 'update', path: 'old.txt', movePath: 'new.txt', chunks: [] },
      new Error('Failed to remove original /workspace/old.txt'),
      { writtenMoveDestination: '/workspace/new.txt' }
    );

    // Act
    const formattedFailure = formatApplyPatchFailure(failure);

    // Assert
    expect(formattedFailure).toBe(
      lines(
        'Patch partially applied:',
        'Failed to move file old.txt to new.txt: Failed to remove original /workspace/old.txt, but /workspace/new.txt was written.'
      )
    );
  });
});
