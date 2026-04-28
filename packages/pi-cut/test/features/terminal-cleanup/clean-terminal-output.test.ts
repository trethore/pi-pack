import { describe, expect, it } from 'vitest';
import { cleanTerminalOutput } from '../../../src/features/terminal-cleanup/clean-terminal-output.js';

describe('cleanTerminalOutput', () => {
  it('strips ANSI escape sequences when enabled', () => {
    expect(
      cleanTerminalOutput('\u001B[31mred\u001B[0m plain', {
        stripAnsi: true,
        collapseCarriageReturns: false,
      })
    ).toBe('red plain');
  });

  it('keeps ANSI escape sequences when disabled', () => {
    expect(
      cleanTerminalOutput('\u001B[31mred\u001B[0m', {
        stripAnsi: false,
        collapseCarriageReturns: false,
      })
    ).toBe('\u001B[31mred\u001B[0m');
  });

  it('collapses carriage-return redraws when enabled', () => {
    expect(
      cleanTerminalOutput('progress 10%\rprogress 100%\ndone\n', {
        stripAnsi: false,
        collapseCarriageReturns: true,
      })
    ).toBe('progress 100%\ndone\n');
  });

  it('keeps carriage-return redraws when disabled', () => {
    expect(
      cleanTerminalOutput('progress 10%\rprogress 100%\n', {
        stripAnsi: false,
        collapseCarriageReturns: false,
      })
    ).toBe('progress 10%\rprogress 100%\n');
  });

  it('can apply both cleanup operations together', () => {
    expect(
      cleanTerminalOutput('\u001B[32mold\u001B[0m\r\u001B[31mnew\u001B[0m\n', {
        stripAnsi: true,
        collapseCarriageReturns: true,
      })
    ).toBe('new\n');
  });
});
