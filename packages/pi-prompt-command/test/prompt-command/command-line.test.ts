import { describe, expect, it } from 'vitest';
import { parseCommandLine } from '#pi-prompt-command/prompt-command/command-line.js';

describe('parseCommandLine', () => {
  it('parses executable and quoted arguments', () => {
    // Act
    const result = parseCommandLine('git commit -m "hello world"');

    // Assert
    expect(result).toEqual({
      ok: true,
      commandLine: {
        command: 'git',
        args: ['commit', '-m', 'hello world'],
        normalized: 'git commit -m "hello world"',
      },
    });
  });

  it.each(['git status && rm -rf .', 'git status; rm -rf .', 'grep a README.md | cat'])(
    'rejects shell syntax in %s',
    (command) => {
      // Act
      const result = parseCommandLine(command);

      // Assert
      expect(result.ok).toBe(false);
    }
  );

  it('preserves empty quoted arguments', () => {
    // Act
    const result = parseCommandLine('printf "" "hello"');

    // Assert
    expect(result).toEqual({
      ok: true,
      commandLine: {
        command: 'printf',
        args: ['', 'hello'],
        normalized: 'printf "" hello',
      },
    });
  });

  it('rejects empty quoted command names', () => {
    // Act
    const result = parseCommandLine('"" arg');

    // Assert
    expect(result).toEqual({ ok: false, error: 'empty command' });
  });

  it('rejects unterminated quotes', () => {
    // Act
    const result = parseCommandLine('npm run "test');

    // Assert
    expect(result).toEqual({ ok: false, error: 'unterminated double quote' });
  });
});
