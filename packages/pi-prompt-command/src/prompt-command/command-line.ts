const SHELL_CONTROL_TOKENS = new Set(['&&', '||', ';', '|', '<', '>', '>>', '2>', '2>>', '&']);
const SHELL_CONTROL_CHARS = /[;&|<>]/;

type Quote = 'single' | 'double';

interface TokenizerState {
  tokens: string[];
  token: string;
  quote?: Quote;
  escaping: boolean;
  tokenStarted: boolean;
}

export interface ParsedCommandLine {
  command: string;
  args: string[];
  normalized: string;
}

export type CommandLineParseResult =
  | { ok: true; commandLine: ParsedCommandLine }
  | { ok: false; error: string };

export function parseCommandLine(input: string): CommandLineParseResult {
  const tokensResult = tokenizeCommandLine(input.trim());
  if (!tokensResult.ok) return tokensResult;

  const tokens = tokensResult.tokens;
  if (tokens.length === 0 || tokens[0].length === 0) return { ok: false, error: 'empty command' };

  const unsupportedToken = tokens.find((token) => isUnsupportedShellToken(token));
  if (unsupportedToken) {
    return {
      ok: false,
      error: `unsupported shell syntax near ${JSON.stringify(unsupportedToken)}`,
    };
  }

  return {
    ok: true,
    commandLine: {
      command: tokens[0],
      args: tokens.slice(1),
      normalized: tokens.map((token) => quoteTokenForPattern(token)).join(' '),
    },
  };
}

function tokenizeCommandLine(
  input: string
): { ok: true; tokens: string[] } | { ok: false; error: string } {
  const state: TokenizerState = {
    tokens: [],
    token: '',
    escaping: false,
    tokenStarted: false,
  };

  for (const char of input) {
    consumeCommandChar(char, state);
  }

  if (state.escaping) state.token += '\\';
  if (state.quote) return { ok: false, error: `unterminated ${state.quote} quote` };
  pushCurrentToken(state);

  return { ok: true, tokens: state.tokens };
}

function consumeCommandChar(char: string, state: TokenizerState) {
  if (state.escaping) {
    state.token += char;
    state.escaping = false;
    state.tokenStarted = true;
    return;
  }

  if (char === '\\' && state.quote !== 'single') {
    state.escaping = true;
    state.tokenStarted = true;
    return;
  }

  if (!state.quote) {
    consumeUnquotedCommandChar(char, state);
    return;
  }

  consumeQuotedCommandChar(char, state);
}

function consumeUnquotedCommandChar(char: string, state: TokenizerState) {
  if (/\s/.test(char)) {
    pushCurrentToken(state);
    return;
  }
  if (char === "'") {
    state.quote = 'single';
    state.tokenStarted = true;
    return;
  }
  if (char === '"') {
    state.quote = 'double';
    state.tokenStarted = true;
    return;
  }
  state.token += char;
  state.tokenStarted = true;
}

function consumeQuotedCommandChar(char: string, state: TokenizerState) {
  if (state.quote === 'single' && char === "'") {
    state.quote = undefined;
    return;
  }
  if (state.quote === 'double' && char === '"') {
    state.quote = undefined;
    return;
  }
  state.token += char;
  state.tokenStarted = true;
}

function pushCurrentToken(state: TokenizerState) {
  if (!state.tokenStarted) return;
  state.tokens.push(state.token);
  state.token = '';
  state.tokenStarted = false;
}

function isUnsupportedShellToken(token: string): boolean {
  return SHELL_CONTROL_TOKENS.has(token) || SHELL_CONTROL_CHARS.test(token);
}

function quoteTokenForPattern(token: string): string {
  return token.length === 0 || /\s/.test(token) ? JSON.stringify(token) : token;
}
