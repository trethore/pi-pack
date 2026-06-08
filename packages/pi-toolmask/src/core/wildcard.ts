export function matchesWildcardPattern(value: string, pattern: string): boolean {
  if (pattern === '*') return true;
  const regex = new RegExp(`^${escapeWildcardPattern(pattern)}$`);
  return regex.test(value);
}

export function matchesAnyWildcardPattern(value: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => matchesWildcardPattern(value, pattern));
}

export function isNegatedWildcardPattern(pattern: string): boolean {
  return pattern.startsWith('!') && pattern.length > 1;
}

export function stripWildcardNegation(pattern: string): string {
  return isNegatedWildcardPattern(pattern) ? pattern.slice(1) : pattern;
}

function escapeWildcardPattern(pattern: string): string {
  return pattern
    .split('*')
    .map((part) => part.replaceAll(/[|\\{}()[\]^$+?.]/g, String.raw`\$&`))
    .join('.*');
}
