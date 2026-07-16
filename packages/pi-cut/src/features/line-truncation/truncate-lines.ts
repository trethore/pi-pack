import { isRepetitionMarker } from '#src/features/repetition-folding/repetition-marker.js';
import { transformLines } from '#src/shared/line.js';

export function truncateLines(text: string, maxChars: number): string {
  return transformLines(text, ({ raw, body, ending }) => {
    if (isRepetitionMarker(body)) return raw;
    if (body.length <= maxChars) return raw;

    const truncation = findTruncation(body, maxChars);
    if (!truncation) return raw;

    return `${body.slice(0, truncation.prefixEnd)} [... truncated at ${maxChars}/${truncation.totalChars} chars]${ending}`;
  });
}

function findTruncation(body: string, maxChars: number): { prefixEnd: number; totalChars: number } | undefined {
  let prefixEnd = 0;
  let totalChars = 0;
  let offset = 0;

  for (const character of body) {
    offset += character.length;
    totalChars += 1;
    if (totalChars === maxChars) prefixEnd = offset;
  }

  return totalChars > maxChars ? { prefixEnd, totalChars } : undefined;
}
