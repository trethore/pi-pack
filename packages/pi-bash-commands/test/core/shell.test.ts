import { describe, expect, it } from 'vitest';

import { prependBashCommandsPath, quoteShell } from '#pi-bash-commands/core/shell.js';

describe('quoteShell', () => {
  it.each([
    ['', "''"],
    ['plain', "'plain'"],
    ["it's", String.raw`'it'\''s'`],
    ['$HOME `pwd` \\', "'$HOME `pwd` \\'"],
  ])('quotes %j', (value, expected) => {
    expect(quoteShell(value)).toBe(expected);
  });

  it('rejects NUL bytes', () => {
    expect(() => quoteShell('bad\0value')).toThrow('NUL');
  });
});

describe('prependBashCommandsPath', () => {
  it('prepends a guarded PATH setup and preserves the command', () => {
    const original = String.raw`printf "%s\n" "$PATH"`;

    const result = prependBashCommandsPath(original, "/tmp/it's here");

    expect(result).toContain(String.raw`cd '/tmp/it'\''s here'`);
    expect(result.endsWith(original)).toBe(true);
    expect(prependBashCommandsPath(result, '/other')).toBe(result);
  });
});
