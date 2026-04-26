export interface LineEndingParts {
  body: string;
  ending: string;
}

export function splitLineEnding(line: string): LineEndingParts {
  if (line.endsWith('\r\n')) return { body: line.slice(0, -2), ending: '\r\n' };
  if (line.endsWith('\n')) return { body: line.slice(0, -1), ending: '\n' };
  if (line.endsWith('\r')) return { body: line.slice(0, -1), ending: '\r' };
  return { body: line, ending: '' };
}
