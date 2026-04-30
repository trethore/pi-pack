const OSC_SEQUENCE_PATTERN = new RegExp(
  String.raw`\u001B\][^\u0007\u001B]*(?:\u0007|\u001B\\)`,
  'g'
);
const ANSI_SEQUENCE_PATTERN = new RegExp(
  String.raw`[\u001B\u009B][[\]\()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PR-TZcf-nq-uy=><~]))`,
  'g'
);
const TRAILING_HORIZONTAL_WHITESPACE_PATTERN = /[ \t]+(?=\r\n|\r|\n|$)/g;

export interface TerminalCleanupOptions {
  stripAnsi: boolean;
  collapseCarriageReturns: boolean;
  trimTrailingWhitespace: boolean;
}

export function cleanTerminalOutput(text: string, options: TerminalCleanupOptions): string {
  let cleaned = text;

  if (options.stripAnsi) {
    cleaned = stripAnsi(cleaned);
  }

  if (options.collapseCarriageReturns) {
    cleaned = collapseCarriageReturns(cleaned);
  }

  if (options.trimTrailingWhitespace) {
    cleaned = trimTrailingWhitespace(cleaned);
  }

  return cleaned;
}

function stripAnsi(text: string): string {
  if (!text.includes('\u001B') && !text.includes('\u009B')) return text;

  return text.replaceAll(OSC_SEQUENCE_PATTERN, '').replaceAll(ANSI_SEQUENCE_PATTERN, '');
}

function trimTrailingWhitespace(text: string): string {
  if (!text.includes(' ') && !text.includes('\t')) return text;

  return text.replaceAll(TRAILING_HORIZONTAL_WHITESPACE_PATTERN, '');
}

function collapseCarriageReturns(text: string): string {
  if (!text.includes('\r')) return text;

  return text.replaceAll(/[^\n]*(?:\n|$)/g, (segment) => {
    if (segment === '') return segment;

    const hasNewline = segment.endsWith('\n');
    const bodyWithPossibleCarriageReturn = hasNewline ? segment.slice(0, -1) : segment;
    const newline = hasNewline ? '\n' : '';
    const hasCrLfEnding = bodyWithPossibleCarriageReturn.endsWith('\r');
    const body = hasCrLfEnding
      ? bodyWithPossibleCarriageReturn.slice(0, -1)
      : bodyWithPossibleCarriageReturn;
    const crLfPrefix = hasCrLfEnding ? '\r' : '';
    const lastCarriageReturnIndex = body.lastIndexOf('\r');

    if (lastCarriageReturnIndex === -1) return segment;

    return `${body.slice(lastCarriageReturnIndex + 1)}${crLfPrefix}${newline}`;
  });
}
