import { transformLines } from '#src/shared/line.js';

export function truncateLines(text: string, maxChars: number): string {
  return transformLines(text, ({ raw, body, ending }) => {
    if (body.length <= maxChars) return raw;

    const chars = [...body];
    if (chars.length <= maxChars) return raw;

    const charsLeft = chars.length - maxChars;
    return `${chars.slice(0, maxChars).join('')} [... truncated, +${charsLeft} chars]${ending}`;
  });
}
