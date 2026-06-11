import { describe, expect, it } from 'vitest';

import { InvalidHunkError, InvalidPatchError, parsePatch } from '#pi-toolbox/features/apply-patch/parser.js';
import { lines } from '#test/utils/lines.js';

describe('apply_patch parser', () => {
  it('parses add, delete, update, move, and environment id hunks', () => {
    // Arrange
    const patch = lines(
      '*** Begin Patch',
      '*** Environment ID: local',
      '*** Add File: created.txt',
      '+created',
      '*** Delete File: obsolete.txt',
      '*** Update File: old.txt',
      '*** Move to: renamed.txt',
      '@@ function example',
      '-old',
      '+new',
      '*** End Patch'
    );

    // Act
    const result = parsePatch(patch);

    // Assert
    expect(result.environmentId).toBe('local');
    expect(result.hunks).toEqual([
      { type: 'add', path: 'created.txt', contents: 'created\n' },
      { type: 'delete', path: 'obsolete.txt' },
      {
        type: 'update',
        path: 'old.txt',
        movePath: 'renamed.txt',
        chunks: [
          {
            changeContext: 'function example',
            oldLines: ['old'],
            newLines: ['new'],
            isEndOfFile: false,
          },
        ],
      },
    ]);
  });

  it('accepts heredoc-wrapped patch text', () => {
    // Arrange
    const patch = lines("<<'EOF'", '*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch', 'EOF');

    // Act and assert
    expect(parsePatch(patch).hunks).toEqual([{ type: 'add', path: 'created.txt', contents: 'created\n' }]);
  });

  it.each([
    [
      'missing begin marker',
      lines('bad', '*** End Patch'),
      InvalidPatchError,
      "The first line of the patch must be '*** Begin Patch'",
    ],
    [
      'missing end marker',
      lines('*** Begin Patch', '*** Add File: a', '+x'),
      InvalidPatchError,
      "The last line of the patch must be '*** End Patch'",
    ],
    [
      'invalid hunk header',
      lines('*** Begin Patch', '*** Frobnicate File: a', '*** End Patch'),
      InvalidHunkError,
      "'*** Frobnicate File: a' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'",
    ],
    [
      'empty update hunk',
      lines('*** Begin Patch', '*** Update File: a', '*** End Patch'),
      InvalidHunkError,
      "Update file hunk for path 'a' is empty",
    ],
  ])('rejects %s', (_name, patch, errorConstructor, message) => {
    // Act and assert
    expect(() => parsePatch(patch)).toThrow(errorConstructor);
    expect(() => parsePatch(patch)).toThrow(message);
  });
});
