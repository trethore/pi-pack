export type WildcardMatcher = (value: string) => boolean;

export function createWildcardMatcher(patterns: readonly string[]): WildcardMatcher {
  if (patterns.length === 0) return () => false;

  const regexes = patterns.map((pattern) => wildcardPatternToRegex(pattern));
  return (value) => regexes.some((regex) => regex.test(value));
}

export function matchesWildcardPattern(value: string, pattern: string): boolean {
  return wildcardPatternToRegex(pattern).test(value);
}

export function isNegatedWildcardPattern(pattern: string): boolean {
  return pattern.startsWith('!') && pattern.length > 1;
}

export function stripWildcardNegation(pattern: string): string {
  return isNegatedWildcardPattern(pattern) ? pattern.slice(1) : pattern;
}

function wildcardPatternToRegex(pattern: string): RegExp {
  if (pattern === '*') return /^.*$/;
  return new RegExp(`^${escapeWildcardPattern(pattern)}$`);
}

function escapeWildcardPattern(pattern: string): string {
  return pattern
    .split('*')
    .map((part) => part.replaceAll(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`))
    .join('.*');
}
