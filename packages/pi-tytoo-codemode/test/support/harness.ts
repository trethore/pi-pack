import type { AgentTool, AgentToolCallOutcome, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { ExtensionToolContext, SessionEntry } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { vi } from "vitest";
import { executeCodemode } from "#src/execute";
import type { CodemodeToolDetails, CodemodeToolOptions } from "#src/types";

export function sampleTool(name = "echo"): AgentTool {
  return { name, label: name, description: `Run ${name}`, parameters: Type.Object({}), execute: vi.fn() };
}
export function outcome(name: string, result: AgentToolResult<unknown>, isError = false): AgentToolCallOutcome {
  return { toolCall: { type: "toolCall", id: `script/${name}`, name, arguments: {} }, result, isError };
}
export function harness(tools: AgentTool[] = [sampleTool()], overrides: Partial<CodemodeToolOptions> = {}) {
  let branch: SessionEntry[] = [];
  const executeTool = vi.fn<ExtensionToolContext["executeTool"]>(async (name, args) =>
    outcome(name, {
      content: [{ type: "text", text: JSON.stringify(args) }],
      details: undefined,
    }),
  );
  const appendEntry = vi.fn((customType: string, data: unknown) => {
    branch.push({
      type: "custom",
      customType,
      data,
      id: String(branch.length),
      parentId: null,
      timestamp: new Date().toISOString(),
    });
  });
  const context = {
    tools,
    executeTool,
    sessionManager: { getBranch: () => branch },
  } as unknown as ExtensionToolContext;
  const options: CodemodeToolOptions = {
    appendEntry,
    ...overrides,
  };
  const onUpdate = vi.fn<(result: AgentToolResult<CodemodeToolDetails>) => void>();
  return {
    executeTool,
    appendEntry,
    context,
    options,
    onUpdate,
    run: (code: string, signal?: AbortSignal) =>
      executeCodemode("script", { code }, signal, onUpdate, context, options),
    switchBranch: (entries: SessionEntry[]) => {
      branch = entries;
    },
  };
}
export function resultText(result: AgentToolResult<unknown>): string {
  return result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("\n");
}
