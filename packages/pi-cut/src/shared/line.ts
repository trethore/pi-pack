const LINE_PATTERN = /[^\r\n]*(?:\r\n|\r|\n|$)/g;

interface LineEndingParts {
  body: string;
  ending: string;
}

export interface LineParts extends LineEndingParts {
  raw: string;
}

function splitLineEnding(line: string): LineEndingParts {
  if (line.endsWith('\r\n')) return { body: line.slice(0, -2), ending: '\r\n' };
  if (line.endsWith('\n')) return { body: line.slice(0, -1), ending: '\n' };
  if (line.endsWith('\r')) return { body: line.slice(0, -1), ending: '\r' };
  return { body: line, ending: '' };
}

export function splitLines(text: string): LineParts[] {
  const lines: LineParts[] = [];

  for (const match of text.matchAll(LINE_PATTERN)) {
    const raw = match[0];
    if (raw === '') continue;

    lines.push(toLineParts(raw));
  }

  return lines;
}

export function transformLines(text: string, transform: (line: LineParts) => string): string {
  let transformedText: string | undefined;
  let copiedThroughIndex = 0;

  for (const match of text.matchAll(LINE_PATTERN)) {
    const raw = match[0];
    if (raw === '') continue;

    const startIndex = match.index;
    const transformedLine = transform(toLineParts(raw));
    if (transformedLine === raw) continue;

    transformedText ??= '';
    transformedText += text.slice(copiedThroughIndex, startIndex);
    transformedText += transformedLine;
    copiedThroughIndex = startIndex + raw.length;
  }

  if (transformedText === undefined) return text;
  return transformedText + text.slice(copiedThroughIndex);
}

function toLineParts(raw: string): LineParts {
  return { raw, ...splitLineEnding(raw) };
}
