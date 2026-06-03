import { describe, expect, it } from 'vitest';
import { resolvePermission } from '#pi-prompt-command/features/prompt-command/permissions.js';

describe('resolvePermission', () => {
  it.each([
    ['git status', 'allow', 'git *'],
    ['git commit -m test', 'deny', 'git commit *'],
    ['git push', 'deny', 'git push *'],
    ['grep TODO README.md', 'allow', 'grep *'],
    ['npm test', 'deny', '*'],
  ] as const)('resolves %s as %s via %s', (command, decision, pattern) => {
    // Arrange
    const permissions = {
      '*': 'deny',
      'git *': 'allow',
      'git commit *': 'deny',
      'git push *': 'deny',
      'grep *': 'allow',
    } as const;

    // Act
    const result = resolvePermission(command, permissions);

    // Assert
    expect(result).toEqual({ decision, pattern });
  });

  it('uses later rule when specificity ties', () => {
    // Arrange
    const permissions = {
      'npm *': 'deny',
      'np* test': 'allow',
    } as const;

    // Act
    const result = resolvePermission('npm test', permissions);

    // Assert
    expect(result.decision).toBe('allow');
  });
});
