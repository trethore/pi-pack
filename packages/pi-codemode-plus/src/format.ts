import { isObject } from "@pi-pack/shared/validation";

const MAX_INPUT_CHARS = 100_000;
const MAX_OUTPUT_CHARS = 200_000;
const MAX_DEPTH = 32;
const MAX_ENTRIES = 2_000;

function formatString(value: string): string {
  if (value.includes("\n")) {
    const lines = value.split("\n").map((line) => JSON.stringify(line).slice(1, -1));
    return `"""\n${lines.join("\n")}\n"""`;
  }
  const plain = /^[A-Za-z_][A-Za-z0-9 _./-]*$/.test(value);
  const reserved = /^(true|false|null|yes|no|on|off)$/i.test(value);
  if (plain && !reserved && value.trim() === value) {
    return value;
  }
  return JSON.stringify(value);
}

function formatScalar(value: unknown): string {
  if (typeof value === "string") {
    return formatString(value);
  }
  if (Object.is(value, -0)) {
    return "-0";
  }
  return JSON.stringify(value);
}

function propertyPath(parent: string, key: string): string {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    return parent ? `${parent}.${key}` : key;
  }
  return `${parent}[${JSON.stringify(key)}]`;
}

function children(value: unknown, path: string): [string, unknown][] {
  if (Array.isArray(value)) {
    return value.map((child: unknown, index) => [`${path}[${index}]`, child]);
  }
  if (isObject(value)) {
    return Object.entries(value).map(([key, child]) => [propertyPath(path, key), child]);
  }
  return [];
}

function formatValue(value: unknown): string {
  const entries: string[] = [];
  let outputChars = 0;

  function visit(current: unknown, path: string, depth: number): void {
    if (depth > MAX_DEPTH || entries.length >= MAX_ENTRIES) {
      throw new Error("Display limit exceeded");
    }
    const nested = children(current, path);
    if (nested.length > 0) {
      for (const [childPath, child] of nested) {
        visit(child, childPath, depth + 1);
      }
      return;
    }
    const scalar = formatScalar(current);
    const entry = path ? `${path}: ${scalar}` : scalar;
    outputChars += entry.length + 2;
    if (outputChars > MAX_OUTPUT_CHARS) {
      throw new Error("Display limit exceeded");
    }
    entries.push(entry);
  }

  visit(value, "", 0);
  return entries.join("\n");
}

function checkNumber(_key: string, value: unknown): unknown {
  if (
    typeof value === "number" &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  ) {
    throw new Error("Number cannot be displayed without precision loss");
  }
  return value;
}

export function formatJson(text: string): string {
  const trimmed = text.trim();
  if (text.length > MAX_INPUT_CHARS || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return text;
  }
  try {
    // Bound expansion and recursion so rendering large or deeply nested output stays responsive.
    const value: unknown = JSON.parse(trimmed, checkNumber);
    const formatted = formatValue(value);
    const leading = text.slice(0, text.length - text.trimStart().length);
    const trailing = text.slice(text.trimEnd().length);
    return leading + formatted + trailing;
  } catch {
    return text;
  }
}
