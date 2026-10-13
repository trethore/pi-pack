import { stripVTControlCharacters } from "node:util";
import {
  createCodemodeExtension,
  initTheme,
  type AgentToolResult,
  type ExtensionAPI,
  type Theme,
  type ToolRenderers,
} from "@earendil-works/pi-coding-agent";
import { beforeAll } from "vitest";

beforeAll(() => initTheme("dark"));

const theme = { fg: (_color: string, text: string) => text, bold: (text: string) => text } as Theme;
type RenderContext = Parameters<NonNullable<ToolRenderers["renderCall"]>>[2];

export const longScript = Array.from({ length: 25 }, (_, index) => `const line${index + 1} = ${index + 1};`).join("\n");

export async function upstreamRenderers(): Promise<ToolRenderers> {
  let renderers: ToolRenderers | undefined;
  await createCodemodeExtension()({
    registerTool(tool: ToolRenderers) {
      renderers = tool;
    },
  } as ExtensionAPI);
  if (!renderers) {
    throw new Error("Codemode did not register its renderers");
  }
  return renderers;
}

export function renderContext(expanded = false): RenderContext {
  return {
    args: { code: longScript },
    toolCallId: "call",
    invalidate: () => {},
    lastComponent: undefined,
    state: {},
    cwd: "/",
    executionStarted: false,
    argsComplete: true,
    isPartial: false,
    expanded,
    showImages: false,
    isError: false,
    durationMs: undefined,
    outputPad: 1,
  };
}

export function resultFor(text: string): AgentToolResult<unknown> {
  return {
    content: [
      { type: "text", text: "Script completed\nWall time 0.1 seconds\nOutput:\n" },
      { type: "text", text },
    ],
    details: { calls: [] },
  };
}

function plain(component: ReturnType<NonNullable<ToolRenderers["renderCall"]>>, width: number): string {
  return stripVTControlCharacters(component.render(width).join("\n"))
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

export function renderCall(
  renderers: ToolRenderers,
  context = renderContext(),
  code = longScript,
  width = 120,
): string {
  if (!renderers.renderCall) {
    throw new Error("Missing call renderer");
  }
  return plain(renderers.renderCall({ code }, theme, context), width);
}

export function renderResult(
  renderers: ToolRenderers,
  result: AgentToolResult<unknown>,
  context = renderContext(true),
): string {
  if (!renderers.renderResult) {
    throw new Error("Missing result renderer");
  }
  return plain(
    renderers.renderResult(result, { expanded: context.expanded, isPartial: context.isPartial }, theme, context),
    120,
  );
}
