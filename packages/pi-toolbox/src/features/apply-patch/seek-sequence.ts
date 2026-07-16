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
    findMatch(lines, pattern, searchStart, (value) => value.trimEnd())
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
