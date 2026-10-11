import { prompts } from "#src/prompts/generated";
import { readFileSync } from "node:fs";
import { isRecord } from "#src/sandbox/values";
import { schemaToType } from "#src/declarations/schema";
import { toCodemodeIdentifier } from "#src/declarations/identifier";

export { toCodemodeIdentifier };

import type { CodemodeJsonSchema, CodemodeTool } from "#src/sandbox/types";

const INDENT = "  ";
/** Largest rendered input type, in characters, before it becomes `unknown`. */
const DEFAULT_INPUT_SCHEMA_MAX_CHARS = 16_000;

/**
 * TypeScript types for MCP results, from the MCP `CallToolResult` schema, so `CallToolResult<T>`
 * declarations can refer to them.
 */
export const MCP_TYPESCRIPT_PREAMBLE = readFileSync(new URL("./mcp.d.ts", import.meta.url), "utf8").trim();

export interface RenderDeclarationsOptions {
  tools?: readonly CodemodeTool[];
  globals?: readonly CodemodeTool[];
}

/**
 * Render TypeScript declarations for the script-visible API. Tools become members of
 * `declare const tools`, globals become `declare function` statements, and `ns.member` globals
 * members of `declare const ns`. Descriptions become doc comments; schemas become types.
 */
export function renderDeclarations(options: RenderDeclarationsOptions): string {
  const sections: string[] = [];
  const tools = options.tools ?? [];

  if (tools.length > 0) {
    sections.push(renderToolsDeclaration(tools));
  }

  sections.push(...renderGlobalDeclarations(options.globals ?? []));

  return sections.join("\n\n");
}

function renderToolsDeclaration(tools: readonly CodemodeTool[]): string {
  const members = tools.map((tool) => `${docComment(tool.description, INDENT)}${INDENT}${renderToolSignature(tool)}`);

  return `declare const tools: {\n${members.join("\n")}\n};`;
}

function renderGlobalDeclarations(globals: readonly CodemodeTool[]): string[] {
  const sections: string[] = [];
  const namespaces = new Map<string, string[]>();

  for (const global of globals) {
    const dot = global.name.indexOf(".");
    if (dot === -1) {
      sections.push(renderGlobal(`declare function ${global.name}`, global, ""));
      continue;
    }

    const namespace = global.name.slice(0, dot);
    const members = namespaces.get(namespace) ?? [];
    if (members.length === 0) {
      namespaces.set(namespace, members);
    }

    members.push(renderGlobal(global.name.slice(dot + 1), global, INDENT));
  }

  for (const [namespace, members] of namespaces) {
    sections.push(`declare const ${namespace}: {\n${members.join("\n")}\n};`);
  }

  return sections;
}

/**
 * One tool as a member of the `tools` object: `name(args: T): Promise<R>;` with the
 * name as the identifier scripts use. Input types longer than `inputMaxChars` render as `unknown`.
 * Tools whose output schema is an MCP `CallToolResult` render as `Promise<CallToolResult<T>>`,
 * which needs {@link MCP_TYPESCRIPT_PREAMBLE}.
 */
export function renderToolSignature(
  tool: Pick<CodemodeTool, "name" | "inputSchema" | "outputSchema">,
  options: { inputMaxChars?: number } = {},
): string {
  let input = "unknown";
  if (tool.inputSchema !== undefined) {
    input = schemaToType(tool.inputSchema, { maxChars: options.inputMaxChars ?? DEFAULT_INPUT_SCHEMA_MAX_CHARS });
  }

  return `${toCodemodeIdentifier(tool.name)}(args: ${input}): Promise<${renderToolOutputType(tool.outputSchema)}>;`;
}

/**
 * A tool's sample: the description followed by the tool's declaration. Used for tool
 * listings and `ALL_TOOLS` entries.
 */
export function renderToolSample(
  tool: Pick<CodemodeTool, "name" | "description" | "inputSchema" | "outputSchema">,
  options: { inputMaxChars?: number } = {},
): string {
  const declaration = `declare const tools: { ${renderToolSignature(tool, options)} };`;

  return prompts.tool.declaration({ description: tool.description?.trim() ?? "", declaration });
}

/**
 * The `structuredContent` schema of an MCP `CallToolResult` output schema (detected by a
 * `content` array of objects, boolean `isError`, and object `_meta`), `true` when it declares none, or
 * `undefined` when the schema is not a `CallToolResult`.
 */
export function mcpStructuredContentSchema(schema: CodemodeJsonSchema | undefined): CodemodeJsonSchema | undefined {
  if (!isRecord(schema) || !isRecord(schema.properties)) {
    return undefined;
  }

  const { content, isError, _meta, structuredContent } = schema.properties;
  if (!isContentArray(content)) {
    return undefined;
  }

  if (!isRecord(isError) || isError.type !== "boolean" || !isRecord(_meta) || _meta.type !== "object") {
    return undefined;
  }

  return isRecord(structuredContent) || typeof structuredContent === "boolean" ? structuredContent : true;
}

/**
 * The type a tool call resolves to: `CallToolResult<T>` for MCP output schemas (needs
 * {@link MCP_TYPESCRIPT_PREAMBLE}), the schema's type otherwise, and `unknown` without a schema.
 */
export function renderToolOutputType(schema: CodemodeJsonSchema | undefined): string {
  const structured = mcpStructuredContentSchema(schema);
  if (structured !== undefined) {
    const type = schemaToType(structured);
    return type === "unknown" ? "CallToolResult" : `CallToolResult<${type}>`;
  }

  return schema === undefined ? "unknown" : schemaToType(schema);
}

function renderGlobal(head: string, global: CodemodeTool, indent: string): string {
  if (global.signature !== undefined) {
    return `${docComment(global.description, indent)}${indent}${head}${global.signature};`;
  }

  const input = global.inputSchema === undefined ? "unknown" : schemaToType(global.inputSchema);
  const output = global.outputSchema === undefined ? "unknown" : schemaToType(global.outputSchema);

  return `${docComment(global.description, indent)}${indent}${head}(args: ${input}): Promise<${output}>;`;
}

function docComment(description: string | undefined, indent: string): string {
  const text = description?.trim();
  if (!text) {
    return "";
  }

  const lines = text.replaceAll("*/", "*\\/").split(/\r?\n/);
  if (lines.length === 1) {
    return `${indent}/** ${lines[0] ?? ""} */\n`;
  }

  return `${indent}/**\n${lines.map((line) => `${indent} *${line ? ` ${line}` : ""}`).join("\n")}\n${indent} */\n`;
}

function isContentArray(content: unknown): boolean {
  return isRecord(content) && content.type === "array" && isRecord(content.items) && content.items.type === "object";
}
