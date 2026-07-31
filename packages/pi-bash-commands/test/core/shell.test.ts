import { describe, expect, it } from 'vitest';

import { prependBashCommandsPath, quoteShell } from '#pi-bash-commands/core/shell.js';

describe('quoteShell', () => {
  it.each([
    ['', "''"],
    ['plain', "'plain'"],
    ["it's", String.raw`'it'\''s'`],
    ['$HOME `pwd` \\', "'$HOME `pwd` \\'"],
  ])('quotes %j', (value, expected) => {
    // Arrange
    const valueToQuote = value;

    // Act
    const quoted = quoteShell(valueToQuote);

    // Assert
    expect(quoted).toBe(expected);
  });

  it('rejects NUL bytes', () => {
    // Arrange
    const value = 'bad\0value';

    // Act
    const quoteNulByte = () => quoteShell(value);

    // Assert
    expect(quoteNulByte).toThrow('NUL');
  });
});

describe('prependBashCommandsPath', () => {
  it('prepends a guarded PATH setup and preserves the command', () => {
    // Arrange
    const original = String.raw`printf "%s\n" "$PATH"`;

    // Act
    const result = prependBashCommandsPath(original, "/tmp/it's here");

    // Assert
    expect(result).toContain(String.raw`cd '/tmp/it'\''s here'`);
    expect(result.endsWith(original)).toBe(true);
    expect(prependBashCommandsPath(result, '/other')).toBe(result);
  });
});
