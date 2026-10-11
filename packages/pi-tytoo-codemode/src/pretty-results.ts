import { isObject } from "@pi-pack/shared/validation";

const MAX_DEPTH = 32;
const RESERVED_STRING = /^(?:null|true|false|yes|no|on|off)$/i;

function isPlainString(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_ ./@+-]*$/.test(value) && value.trim() === value && !RESERVED_STRING.test(value);
}

function hasUnsupportedControls(value: string): boolean {
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code < 32 && code !== 9 && code !== 10) || code === 127) {
      return true;
    }
  }
  return false;
}

function formatScalar(value: unknown, indent: string): string {
  if (typeof value !== "string") {
    return JSON.stringify(value);
  }

  const normalized = value.replace(/\r\n/g, "\n");
  if (normalized.includes("\n") && !normalized.includes('"""') && !hasUnsupportedControls(normalized)) {
    return `"""\n${normalized
      .split("\n")
      .map((line) => indent + line)
      .join("\n")}\n${indent}"""`;
  }

  return isPlainString(value) ? value : JSON.stringify(value);
}

function hasChildren(value: unknown): boolean {
  return Array.isArray(value) ? value.length > 0 : isObject(value) && Object.keys(value).length > 0;
}

function formatEntry(label: string, value: unknown, depth: number): string {
  const indent = "  ".repeat(depth);
  if (depth < MAX_DEPTH && hasChildren(value)) {
    return `${indent}${label}\n${formatCollection(value, depth + 1)}`;
  }
  return `${indent}${label} ${formatScalar(value, indent)}`;
}

function formatCollection(value: unknown, depth: number): string {
  if (Array.isArray(value)) {
    return value.map((item: unknown) => formatEntry("-", item, depth)).join("\n");
  }
  if (isObject(value)) {
    return Object.entries(value)
      .map(([key, item]) => {
        const label = /^[A-Za-z_][A-Za-z0-9_-]*$/.test(key) && !RESERVED_STRING.test(key) ? key : JSON.stringify(key);
        return formatEntry(`${label}:`, item, depth);
      })
      .join("\n");
  }
  return formatScalar(value, "  ".repeat(depth));
}

function formatSection(text: string): string {
  try {
    const value: unknown = JSON.parse(text);
    if (!hasChildren(value)) {
      return text;
    }
    const trailingNewlines = text.match(/\n+$/)?.[0] ?? "";
    return formatCollection(value, 0) + trailingNewlines;
  } catch {
    return text;
  }
}

export function formatPrettyResult(text: string): string {
  // Execution joins adjacent text blocks. Captured separators, console output, and errors stay unchanged.
  return text
    .split(
      /(^==> text \d+\/\d+ <==\n|^<console_output>\n[\s\S]*?^<\/console_output>(?:\n|$)|^Script error:\n[\s\S]*|^\[Image[^\n]*\](?:\n|$)|^Note: models\.generateImages\(\)[^\n]*(?:\n|$))/m,
    )
    .map((section, index) => (index % 2 === 0 ? formatSection(section) : section))
    .join("");
}
