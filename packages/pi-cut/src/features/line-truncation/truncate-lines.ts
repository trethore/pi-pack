export function truncateLines(text: string, maxChars: number): string {
  return text.replaceAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g, (lineWithEnding) => {
    if (lineWithEnding === '') return lineWithEnding;

    const { line, ending } = splitLineEnding(lineWithEnding);
    if (line.length <= maxChars) return lineWithEnding;

    const chars = [...line];
    if (chars.length <= maxChars) return lineWithEnding;

    const charsLeft = chars.length - maxChars;
    return `${chars.slice(0, maxChars).join('')} (truncated at ${maxChars}, ${charsLeft} chars left...)${ending}`;
  });
}

function splitLineEnding(lineWithEnding: string): { line: string; ending: string } {
  if (lineWithEnding.endsWith('\r\n')) return { line: lineWithEnding.slice(0, -2), ending: '\r\n' };
  if (lineWithEnding.endsWith('\n')) return { line: lineWithEnding.slice(0, -1), ending: '\n' };
  if (lineWithEnding.endsWith('\r')) return { line: lineWithEnding.slice(0, -1), ending: '\r' };
  return { line: lineWithEnding, ending: '' };
}
