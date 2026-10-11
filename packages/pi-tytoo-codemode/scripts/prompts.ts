import { format } from "prettier";
import { parse } from "yaml";

const IDENTIFIER = /^[a-zA-Z][a-zA-Z0-9]*$/;
const PLACEHOLDER = /\{\{([a-zA-Z][a-zA-Z0-9]*)\}\}/g;

function compileText(text: string, path: string): string {
  if (text.trim() === "") {
    throw new Error(`${path} must not be empty`);
  }

  const remaining = text.replace(PLACEHOLDER, "");
  if (remaining.includes("{{") || remaining.includes("}}")) {
    throw new Error(`${path} contains an invalid placeholder`);
  }

  const matches = [...text.matchAll(PLACEHOLDER)];
  if (matches.length === 0) {
    return JSON.stringify(text);
  }

  const names = [...new Set(matches.map((match) => match[1]!))];
  const escaped = text.replaceAll("\\", "\\\\").replaceAll("`", "\\`").replaceAll("${", "\\${");
  const template = escaped.replace(PLACEHOLDER, (_match, name: string) => "${values." + name + "}");

  const fields = names.map((name) => `${name}: string | number`).join("; ");
  return `(values: { ${fields} }): string => \`${template}\``;
}

function compileNode(value: unknown, path: string): string {
  if (typeof value === "string") {
    return compileText(value, path);
  }
  if (Array.isArray(value)) {
    if (value.length === 0 || !value.every((item: unknown) => typeof item === "string")) {
      throw new Error(`${path} must be a non-empty list of strings`);
    }
    return `[${value.map((item: string, index) => compileText(item, `${path}[${index}]`)).join(",")} ]`;
  }
  return compileSection(value, path);
}

function compileSection(value: unknown, path: string): string {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${path} must be a section, string, or list of strings`);
  }
  const entries = Object.entries(value);
  if (entries.length === 0) {
    throw new Error(`${path} must not be empty`);
  }
  const fields = entries.map(([key, child]: [string, unknown]) => {
    if (!IDENTIFIER.test(key)) {
      throw new Error(`${path}.${key} is not a valid prompt key`);
    }
    return `${key}: ${compileNode(child, `${path}.${key}`)}`;
  });
  return `{${fields.join(",")}}`;
}

export async function compilePrompts(source: string): Promise<string> {
  const document: unknown = parse(source, { maxAliasCount: 0, uniqueKeys: true });
  const expression = compileSection(document, "prompts");
  return format(
    `// Generated from prompts.yaml by npm run build:prompts. Do not edit.\nexport const prompts = ${expression} as const;\n`,
    { parser: "typescript", printWidth: 120 },
  );
}
