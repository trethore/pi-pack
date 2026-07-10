import { isRepetitionMarker } from '#src/features/repetition-folding/repetition-marker.js';
import { transformLines } from '#src/shared/line.js';

export function truncateLines(text: string, maxChars: number): string {
  return transformLines(text, ({ raw, body, ending }) => {
    if (isRepetitionMarker(body)) return raw;
    if (body.length <= maxChars) return raw;

    const chars = [...body];
    if (chars.length <= maxChars) return raw;

    return `${chars.slice(0, maxChars).join('')} [... truncated at ${maxChars}/${chars.length} chars]${ending}`;
  });
}
