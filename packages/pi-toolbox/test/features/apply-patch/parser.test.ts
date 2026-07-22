import { describe, expect, it } from 'vitest';

import { InvalidHunkError, InvalidPatchError, parsePatch } from '#pi-toolbox/features/apply-patch/parser.js';
import { lines } from '#test/utils/lines.js';

describe('apply_patch parser', () => {
  it('parses add, delete, update, and move hunks', () => {
    // Arrange
    const patch = lines(
      '*** Begin Patch',
      '*** Add File: @created.txt',
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

  it.each([
    [
      'missing begin marker',
      lines('bad', '*** End Patch'),
      InvalidPatchError,
      "The first line of the patch must be '*** Begin Patch'",
    ],
    [
      'heredoc wrapper',
      lines("<<'EOF'", '*** Begin Patch', '*** Add File: created.txt', '+created', '*** End Patch', 'EOF'),
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
      'missing space after path marker',
      lines('*** Begin Patch', '*** Add File:a', '+x', '*** End Patch'),
      InvalidHunkError,
      "'*** Add File:a' is not a valid hunk header",
    ],
    [
      'empty update hunk',
      lines('*** Begin Patch', '*** Update File: a', '*** End Patch'),
      InvalidHunkError,
      "Update file hunk for path 'a' is empty",
    ],
    [
      'empty file path',
      lines('*** Begin Patch', '*** Add File: ', '+x', '*** End Patch'),
      InvalidHunkError,
      "Path after '*** Add File:' cannot be empty",
    ],
  ])('rejects %s', (_name, patch, errorConstructor, message) => {
    // Act
    const operation = () => parsePatch(patch);

    // Assert
    expect(operation).toThrow(errorConstructor);
    expect(operation).toThrow(message);
  });
});
