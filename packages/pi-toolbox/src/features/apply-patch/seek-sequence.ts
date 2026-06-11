export function seekSequence(
  lines: readonly string[],
  pattern: readonly string[],
  start: number,
  eof: boolean
): number | undefined {
  if (pattern.length === 0) return start;
  if (pattern.length > lines.length) return undefined;

  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start;

  return (
    findMatch(lines, pattern, searchStart, (value) => value) ??
    findMatch(lines, pattern, searchStart, (value) => value.trimEnd()) ??
    findMatch(lines, pattern, searchStart, (value) => value.trim()) ??
    findMatch(lines, pattern, searchStart, normalizeLine)
  );
}

function findMatch(
  lines: readonly string[],
  pattern: readonly string[],
  start: number,
  normalize: (value: string) => string
): number | undefined {
  const end = lines.length - pattern.length;
  for (let index = start; index <= end; index += 1) {
    if (matchesAt(lines, pattern, index, normalize)) return index;
  }
  return undefined;
}

function matchesAt(
  lines: readonly string[],
  pattern: readonly string[],
  index: number,
  normalize: (value: string) => string
): boolean {
  return pattern.every((line, offset) => normalize(lines[index + offset] ?? '') === normalize(line));
}

function normalizeLine(value: string): string {
  return value
    .trim()
    .replaceAll(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replaceAll(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replaceAll(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replaceAll(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, ' ');
}
