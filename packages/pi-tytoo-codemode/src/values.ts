import { encodeJson } from "#src/sandbox/values";
import type { AgentToolResult } from "@earendil-works/pi-agent-core";
import type { TextContent } from "@earendil-works/pi-ai";
const ARGS_PREVIEW_CHARS = 200;
export function truncateText(text: string, maxChars: number): string {
  return text.length > maxChars ? `${text.slice(0, maxChars - 3)}...` : text;
}

export function previewArgs(args: unknown): string {
  if (args === undefined) {
    return "";
  }
  try {
    return truncateText(encodeJson(args) ?? "", ARGS_PREVIEW_CHARS);
  } catch {
    return "";
  }
}

export function textOf(result: AgentToolResult<unknown>): string {
  return result.content
    .filter((block): block is TextContent => block.type === "text")
    .map((block) => block.text)
    .join("\n");
}
