const SHELL_CONTROL_TOKENS = new Set(['&&', '||', ';', '|', '<', '>', '>>', '2>', '2>>', '&']);
const SHELL_CONTROL_CHARS = /[;&|<>]/;

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
  if (tokens.length === 0) return { ok: false, error: 'empty command' };

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
  const tokens: string[] = [];
  let token = '';
  let quote: 'single' | 'double' | undefined;
  let escaping = false;

  for (const char of input) {
    if (escaping) {
      token += char;
      escaping = false;
      continue;
    }

    if (char === '\\' && quote !== 'single') {
      escaping = true;
      continue;
    }

    const result = consumeCommandChar(char, quote, token, tokens);
    quote = result.quote;
    token = result.token;
  }

  if (escaping) token += '\\';
  if (quote) return { ok: false, error: `unterminated ${quote} quote` };
  if (token.length > 0) tokens.push(token);

  return { ok: true, tokens };
}

function consumeCommandChar(
  char: string,
  quote: 'single' | 'double' | undefined,
  token: string,
  tokens: string[]
): { quote: 'single' | 'double' | undefined; token: string } {
  if (!quote) return consumeUnquotedCommandChar(char, token, tokens);
  return consumeQuotedCommandChar(char, quote, token);
}

function consumeUnquotedCommandChar(
  char: string,
  token: string,
  tokens: string[]
): { quote: 'single' | 'double' | undefined; token: string } {
  if (/\s/.test(char)) {
    if (token.length > 0) tokens.push(token);
    return { quote: undefined, token: '' };
  }
  if (char === "'") return { quote: 'single', token };
  if (char === '"') return { quote: 'double', token };
  return { quote: undefined, token: token + char };
}

function consumeQuotedCommandChar(
  char: string,
  quote: 'single' | 'double',
  token: string
): { quote: 'single' | 'double' | undefined; token: string } {
  if (quote === 'single' && char === "'") return { quote: undefined, token };
  if (quote === 'double' && char === '"') return { quote: undefined, token };
  return { quote, token: token + char };
}

function isUnsupportedShellToken(token: string): boolean {
  return SHELL_CONTROL_TOKENS.has(token) || SHELL_CONTROL_CHARS.test(token);
}

function quoteTokenForPattern(token: string): string {
  return /\s/.test(token) ? JSON.stringify(token) : token;
}
