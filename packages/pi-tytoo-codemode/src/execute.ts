import type { AgentTool, AgentToolCallOutcome, AgentToolResult } from "@earendil-works/pi-agent-core";
import type { Usage } from "@earendil-works/pi-ai";
import type { ExtensionToolContext } from "@earendil-works/pi-coding-agent";
import type { CodemodeTool, CodemodeResult } from "#src/sandbox/types";
import { CodemodeSandbox } from "#src/sandbox/sandbox";
import { parseCodemodeSource } from "#src/source/parse";
import { renderToolSample } from "#src/declarations/render";
import { CODEMODE_STORE_ENTRY_TYPE } from "#src/constants";
import {
  type CodemodeNestedCall,
  type CodemodeToolDetails,
  type CodemodeToolInput,
  type CodemodeToolOptions,
} from "#src/types";
import { getCodemodeCallableTools, toCodemodeDeclaration } from "#src/declarations/tools";
import { createDiscoveryGlobals } from "#src/discovery";
import { createModelGlobals } from "#src/models";
import { readCodemodeStore } from "#src/session-store";
import { previewArgs, truncateText, textOf } from "#src/values";
import { combineUsage } from "#src/usage";
import {
  valueText,
  formatOutput,
  formatError,
  joinAdjacentText,
  truncateOutput,
  saveImages,
  DEFAULT_MAX_OUTPUT_TOKENS,
} from "#src/output";
const ERROR_PREVIEW_CHARS = 500;
const CODEMODE_MEMORY_LIMIT_BYTES = 256 * 1024 * 1024;
/**
 * The value a script receives for a nested call: a tool that declares
 * `outputSchema` resolves to its `structuredContent`, also for error results that carry one (such
 * as MCP results with `isError`); any other tool resolves to its text content. Other failures
 * reject with the tool's error text.
 */
function toScriptValue(tool: AgentTool, outcome: AgentToolCallOutcome): unknown {
  const { result } = outcome;
  if (tool.outputSchema && result.structuredContent !== undefined) {
    return result.structuredContent;
  }
  const text = textOf(result);
  if (outcome.isError) {
    throw new Error(text || `Tool "${tool.name}" failed`);
  }
  return text;
}

export async function executeCodemode(
  toolCallId: string,
  input: CodemodeToolInput,
  signal: AbortSignal | undefined,
  onUpdate: ((result: AgentToolResult<CodemodeToolDetails>) => void) | undefined,
  ctx: ExtensionToolContext,
  options: CodemodeToolOptions,
): Promise<AgentToolResult<CodemodeToolDetails>> {
  const startedAt = performance.now();
  const { code, options: sourceOptions } = parseCodemodeSource(input.code);
  const calls: CodemodeNestedCall[] = [];
  // Usage of the script's `models.*` calls. Nested tool calls report theirs through the session.
  let modelUsage: Usage | undefined;
  // Images returned by `models.generateImages()`, to notice a script that never shows them.
  let generatedImages = 0;
  const addGeneratedImages = (count: number) => {
    generatedImages += count;
  };
  const addModelUsage = (usage: Usage) => {
    modelUsage = modelUsage ? combineUsage(modelUsage, usage) : usage;
  };

  const snapshot = (): CodemodeToolDetails => ({ calls: calls.map((call) => ({ ...call })) });
  const publish = () => onUpdate?.({ content: [], details: snapshot() });

  const callable = getCodemodeCallableTools(ctx.tools);
  // ALL_TOOLS entries carry the declaration.
  const guidelines = options.getToolGuidelines?.();
  const samples = new Map(
    callable.map((tool) => [tool.name, renderToolSample(toCodemodeDeclaration(tool, guidelines?.get(tool.name)))]),
  );
  const sandboxTools = createSandboxTools(callable, samples, toolCallId, ctx, calls, publish);

  const sandbox = new CodemodeSandbox({
    tools: sandboxTools,
    globals: [
      ...createDiscoveryGlobals(callable, samples, options),
      ...(options.models
        ? createModelGlobals(ctx.modelRegistry, toolCallId, calls, publish, addModelUsage, addGeneratedImages)
        : []),
    ],
    timeoutMs: sourceOptions.timeoutMs ?? Number.POSITIVE_INFINITY,
    memoryLimitBytes: CODEMODE_MEMORY_LIMIT_BYTES,
  });

  let result: CodemodeResult;
  try {
    const store = readCodemodeStore(ctx.sessionManager.getBranch());
    result = await sandbox.execute(code, { ...(signal ? { signal } : {}), store });
  } finally {
    await sandbox.close();
  }
  const items = collectOutput(result, calls, generatedImages, options);

  return finishOutput(
    result,
    items,
    calls,
    modelUsage,
    sourceOptions.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    startedAt,
  );
}

function createSandboxTools(
  callable: AgentTool[],
  samples: Map<string, string>,
  toolCallId: string,
  ctx: ExtensionToolContext,
  calls: CodemodeNestedCall[],
  publish: () => void,
): CodemodeTool[] {
  return callable.map((tool) => ({
    name: tool.name,
    description: samples.get(tool.name) ?? "",
    execute: async (args, { signal: callSignal }) => {
      const record: CodemodeNestedCall = {
        id: `${toolCallId}/?`,
        name: tool.name,
        args: previewArgs(args),
        status: "running",
      };
      calls.push(record);
      publish();
      const callStartedAt = performance.now();
      const outcome = await ctx.executeTool(tool.name, args, { signal: callSignal });
      record.id = outcome.toolCall.id;
      record.durationMs = performance.now() - callStartedAt;
      if (outcome.isError) {
        record.status = callSignal.aborted ? "cancelled" : "error";
        record.error = truncateText(textOf(outcome.result) || `Tool "${tool.name}" failed`, ERROR_PREVIEW_CHARS);
      } else {
        record.status = "ok";
      }
      publish();
      return toScriptValue(tool, outcome);
    },
  }));
}

function collectOutput(
  result: CodemodeResult,
  calls: CodemodeNestedCall[],
  generatedImages: number,
  options: CodemodeToolOptions,
) {
  // Calls still marked running were cut off by the script ending, a timeout, or an abort.
  for (const call of calls) {
    if (call.status === "running") {
      call.status = "cancelled";
    }
  }

  const scriptOutput = [...result.output];
  if (result.ok) {
    persistWrites(result, options);
    // pi extension: a returned value is appended like text().
    if (result.value !== undefined) {
      scriptOutput.push({ type: "text", text: valueText(result.value) });
    }
  }
  const items = formatOutput(scriptOutput);
  if (!result.ok) {
    items.push({ type: "text", text: `Script error:\n${formatError(result, calls)}` });
  }
  if (generatedImages > 0 && !items.some((item) => item.type === "image")) {
    items.push({
      type: "text",
      text: `Note: models.generateImages() returned ${generatedImages} image${generatedImages === 1 ? "" : "s"} that the script did not show. Show each image block of result.output with image(block).`,
    });
  }

  return items;
}

function persistWrites(result: Extract<CodemodeResult, { ok: true }>, options: CodemodeToolOptions): void {
  const { set, delete: deleted } = result.storeWrites;
  if (Object.keys(set).length > 0 || deleted.length > 0) {
    options.appendEntry?.(CODEMODE_STORE_ENTRY_TYPE, { set, delete: deleted });
  }
}

async function finishOutput(
  result: CodemodeResult,
  items: ReturnType<typeof formatOutput>,
  calls: CodemodeNestedCall[],
  modelUsage: Usage | undefined,
  maxTokens: number,
  startedAt: number,
): Promise<AgentToolResult<CodemodeToolDetails>> {
  const truncated = await truncateOutput(joinAdjacentText(items), maxTokens);
  // After truncation, which joins the text items and moves images after them, so each path stays
  // next to its image and is never cut.
  const output = joinAdjacentText(await saveImages(truncated.items));
  const wallTime = ((performance.now() - startedAt) / 1000).toFixed(1);
  const header = `${result.ok ? "Script completed" : "Script failed"}\nWall time ${wallTime} seconds\nOutput:\n`;
  const details: CodemodeToolDetails = { calls: calls.map((call) => ({ ...call })) };
  if (truncated.fullOutputPath) {
    details.fullOutputPath = truncated.fullOutputPath;
  }
  return {
    content: [{ type: "text", text: header }, ...output],
    details,
    ...(modelUsage ? { usage: modelUsage } : {}),
    ...(result.ok ? {} : { isError: true }),
  };
}
