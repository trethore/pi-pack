import { splitLineEnding } from '#src/shared/line.js';

export function truncateLines(text: string, maxChars: number): string {
  return text.replaceAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g, (lineWithEnding) => {
    if (lineWithEnding === '') return lineWithEnding;

    const { body, ending } = splitLineEnding(lineWithEnding);
    if (body.length <= maxChars) return lineWithEnding;

    const chars = [...body];
    if (chars.length <= maxChars) return lineWithEnding;

    const charsLeft = chars.length - maxChars;
    return `${chars.slice(0, maxChars).join('')} (truncated at ${maxChars}, ${charsLeft} chars left...)${ending}`;
  });
}
