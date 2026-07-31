import { describe, expect, it } from 'vitest';

import { createCompactPathFormatter } from '#pi-bash-commands/cli/shared/paths.js';

describe('createCompactPathFormatter', () => {
  it.each([
    {
      roots: ['.'],
      path: 'src/index.ts',
      expected: 'src/index.ts',
    },
    {
      roots: ['/tmp/test/repository'],
      path: '/tmp/test/repository/src/index.ts',
      expected: 'src/index.ts',
    },
    {
      roots: ['/home/user/project/src', '/tmp/project/src'],
      path: '/home/user/project/src/index.ts',
      expected: 'user/project/src/index.ts',
    },
    {
      roots: ['/tmp/project/src/index.ts'],
      path: '/tmp/project/src/index.ts',
      expected: 'index.ts',
    },
  ])('formats $path against $roots', ({ roots, path, expected }) => {
    // Arrange
    const formatPath = createCompactPathFormatter(roots);

    // Act
    const result = formatPath(path);

    // Assert
    expect(result).toBe(expected);
  });
});
