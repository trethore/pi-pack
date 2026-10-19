import { EXTENSION_NAME } from "#src/constants";
import type { ExecutionConfig } from "#src/config";
import { execute } from "#src/execute";

interface ExpansionOptions {
  execution: ExecutionConfig;
  cwd: string;
  signal: AbortSignal;
  warn: (message: string) => void;
}

function escaped(text: string, index: number): boolean {
  let backslashes = 0;
  while (index > 0 && text[--index] === "\\") {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

function closingBacktick(text: string, from: number): number {
  let index = text.indexOf("`", from);
  while (index !== -1 && escaped(text, index)) {
    index = text.indexOf("`", index + 1);
  }
  return index;
}

function* placeholders(text: string) {
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf("!`", cursor);
    if (start === -1) {
      return;
    }
    cursor = start + 2;
    if (escaped(text, start)) {
      continue;
    }
    const close = closingBacktick(text, cursor);
    if (close === -1) {
      return;
    }
    yield { start, end: close + 1, command: text.slice(cursor, close) };
    cursor = close + 1;
  }
}

export async function expandPlaceholders(text: string, options: ExpansionOptions): Promise<string> {
  const { execution, cwd, signal, warn } = options;
  let output = "";
  let cursor = 0;
  for (const placeholder of placeholders(text)) {
    signal.throwIfAborted();
    const result = await execute(placeholder.command, execution, cwd, signal);
    signal.throwIfAborted();
    const literal = text.slice(placeholder.start, placeholder.end);
    output += text.slice(cursor, placeholder.start);
    output += result.ok ? result.stdout : literal;
    if (!result.ok) {
      warn(
        `${EXTENSION_NAME}: ${JSON.stringify(literal.slice(0, 200))} failed: ${result.reason}. Placeholder left unchanged.`,
      );
    }
    cursor = placeholder.end;
  }
  return output + text.slice(cursor);
}
