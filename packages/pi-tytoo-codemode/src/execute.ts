import { prompts } from "#src/prompts/generated";
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
    throw new Error(text || prompts.results.toolFailed({ name: tool.name }));
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

  const tracking = createExecutionTracking(onUpdate);
  const sandbox = createExecutionSandbox(toolCallId, ctx, options, tracking, sourceOptions.timeoutMs);

  let result: CodemodeResult;
  try {
    const store = readCodemodeStore(ctx.sessionManager.getBranch());
    result = await sandbox.execute(code, { ...(signal ? { signal } : {}), store });
  } finally {
    await sandbox.close();
  }

  // Calls still marked running were cut off by the script ending, a timeout, or an abort.
  for (const call of tracking.calls) {
    if (call.status === "running") {
      call.status = "cancelled";
    }
  }

  if (result.ok) {
    persistWrites(result, options);
  }

  const items = collectOutput(result, tracking.calls, tracking.generatedImages);
  return finishOutput(
    result,
    items,
    tracking.calls,
    tracking.modelUsage,
    sourceOptions.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    startedAt,
  );
}

function createExecutionTracking(onUpdate: ((result: AgentToolResult<CodemodeToolDetails>) => void) | undefined) {
  const calls: CodemodeNestedCall[] = [];
  // Usage of the script's `models.*` calls. Nested tool calls report theirs through the session.
  let modelUsage: Usage | undefined;
  // Images returned by `models.generateImages()`, to notice a script that never shows them.
  let generatedImages = 0;

  return {
    calls,
    get modelUsage() {
      return modelUsage;
    },
    get generatedImages() {
      return generatedImages;
    },
    addModelUsage(this: void, usage: Usage): void {
      modelUsage = modelUsage ? combineUsage(modelUsage, usage) : usage;
    },
    addGeneratedImages(this: void, count: number): void {
      generatedImages += count;
    },
    publish(this: void): void {
      const details = { calls: calls.map((call) => ({ ...call })) };
      onUpdate?.({ content: [], details });
    },
  };
}

function createExecutionSandbox(
  toolCallId: string,
  ctx: ExtensionToolContext,
  options: CodemodeToolOptions,
  tracking: ReturnType<typeof createExecutionTracking>,
  timeoutMs: number | undefined,
): CodemodeSandbox {
  const callable = getCodemodeCallableTools(ctx.tools);
  // ALL_TOOLS entries carry the declaration.
  const guidelines = options.getToolGuidelines?.();
  const samples = new Map(
    callable.map((tool) => [tool.name, renderToolSample(toCodemodeDeclaration(tool, guidelines?.get(tool.name)))]),
  );

  const tools = createSandboxTools(callable, samples, toolCallId, ctx, tracking.calls, tracking.publish);
  const globals = createDiscoveryGlobals(callable, samples, options);
  if (options.models) {
    globals.push(
      ...createModelGlobals(
        ctx.modelRegistry,
        toolCallId,
        tracking.calls,
        tracking.publish,
        tracking.addModelUsage,
        tracking.addGeneratedImages,
      ),
    );
  }

  return new CodemodeSandbox({
    tools,
    globals,
    timeoutMs: timeoutMs ?? Number.POSITIVE_INFINITY,
  });
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
        record.error = truncateText(
          textOf(outcome.result) || prompts.results.toolFailed({ name: tool.name }),
          ERROR_PREVIEW_CHARS,
        );
      } else {
        record.status = "ok";
      }

      publish();
      return toScriptValue(tool, outcome);
    },
  }));
}

function collectOutput(result: CodemodeResult, calls: CodemodeNestedCall[], generatedImages: number) {
  const scriptOutput = [...result.output];

  // pi extension: a returned value is appended like text().
  if (result.ok && result.value !== undefined) {
    scriptOutput.push({ type: "text", text: valueText(result.value) });
  }

  const items = formatOutput(scriptOutput);
  if (!result.ok) {
    items.push({ type: "text", text: prompts.results.scriptError({ error: formatError(result, calls) }) });
  }

  if (generatedImages > 0 && !items.some((item) => item.type === "image")) {
    items.push({
      type: "text",
      text: prompts.results.unshownImages({ count: generatedImages, suffix: generatedImages === 1 ? "" : "s" }),
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
  const header = prompts.results.header({
    status: result.ok ? prompts.results.completed : prompts.results.failed,
    wallTime,
  });

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
