import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
  SessionEntry,
} from '@earendil-works/pi-coding-agent';
import { clampThinkingLevel, type Api, type Model, type ModelThinkingLevel, type Tool } from '@earendil-works/pi-ai';
import { resolveLatestNativeCompactionEntry } from '#pi-codexify/features/openai-compaction/core/details-store.js';
import type { NativeCompactionRuntime } from '#pi-codexify/features/openai-compaction/core/runtime.js';
import {
  serializeCompactionPreparationToRequest,
  type NativeCompactionRequestBody,
  type NativeCompactionRequestOptions,
  type ResponsesInputItem,
} from '#pi-codexify/features/openai-compaction/core/serializer.js';
import { cloneRecordArray } from '#pi-codexify/features/openai-compaction/core/structured.js';
import { serializeLiveTailToResponsesInput } from '#pi-codexify/features/openai-compaction/replay/replay.js';
import { convertResponsesTools } from '#pi-codexify/features/openai-compaction/responses/openai-responses-conversion.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64;

export type NativeCompactionRequestBuildResult =
  | {
      ok: true;
      request: NativeCompactionRequestBody;
      compactedKeptWindow: boolean;
      compactionModel: string;
    }
  | {
      ok: false;
      message: string;
    };

export function cloneCompactedWindow(window: readonly unknown[]): ResponsesInputItem[] | undefined {
  return cloneRecordArray<ResponsesInputItem>(window);
}

function buildCompactionInstructions(systemPrompt: string, customInstructions?: string): string {
  const guidance = customInstructions?.trim();
  return guidance
    ? `${systemPrompt}\n\nAdditional user guidance for this manual /compact request:\n${guidance}`
    : systemPrompt;
}

function buildCompactionTools(pi: ExtensionAPI): unknown[] | undefined {
  const activeToolNames = new Set(pi.getActiveTools());
  const tools = pi
    .getAllTools()
    .filter((tool) => activeToolNames.has(tool.name))
    .map((tool): Tool => ({ name: tool.name, description: tool.description, parameters: tool.parameters }));
  return tools.length === 0 ? undefined : convertResponsesTools(tools, { strict: null });
}

function buildCompactionReasoning(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: OpenAICompactionState
): NativeCompactionRequestOptions['reasoning'] {
  const model = ctx.model;
  const level = state.config.reasoning === 'current' ? pi.getThinkingLevel() : state.config.reasoning;
  if (!model?.reasoning || level === 'off') return undefined;

  const clampedLevel = clampThinkingLevel(model, level as ModelThinkingLevel);
  const effort = model.thinkingLevelMap?.[clampedLevel] ?? clampedLevel;
  return effort === null ? undefined : { effort, summary: 'auto' };
}

function clampOpenAIPromptCacheKey(key: string): string {
  const chars = [...key];
  return chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH
    ? key
    : chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join('');
}

function buildCompactionRequestOptions(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  state: OpenAICompactionState
): NativeCompactionRequestOptions {
  const tools = buildCompactionTools(pi);
  const reasoning = buildCompactionReasoning(pi, ctx, state);
  return {
    parallel_tool_calls: true,
    prompt_cache_key: clampOpenAIPromptCacheKey(ctx.sessionManager.getSessionId()),
    ...(tools ? { tools } : {}),
    ...(reasoning ? { reasoning } : {}),
  };
}

export function buildNativeCompactionRequest(args: {
  pi: ExtensionAPI;
  ctx: ExtensionContext;
  state: OpenAICompactionState;
  runtime: NativeCompactionRuntime;
  branchEntries: readonly SessionEntry[];
  event: SessionBeforeCompactEvent;
}): NativeCompactionRequestBuildResult {
  const compactionModel = args.state.config.model;
  const targetModel = { ...args.runtime.currentModel, id: compactionModel };
  const instructions = buildCompactionInstructions(args.ctx.getSystemPrompt(), args.event.customInstructions);
  const requestOptions = buildCompactionRequestOptions(args.pi, args.ctx, args.state);
  const latestNativeCompaction = resolveLatestNativeCompactionEntry(args.branchEntries, {
    provider: args.runtime.provider,
    api: args.runtime.api,
    baseUrl: args.runtime.baseUrl,
  });

  if (latestNativeCompaction.ok) {
    return buildRequestAfterNativeCompaction({
      branchEntries: args.branchEntries,
      compactionModel,
      targetModel,
      instructions,
      requestOptions,
      latestNativeCompaction,
    });
  }

  return buildRequestFromPreparation({
    branchEntries: args.branchEntries,
    targetModel,
    event: args.event,
    instructions,
    requestOptions,
  });
}

function buildRequestAfterNativeCompaction<TApi extends Api>(args: {
  branchEntries: readonly SessionEntry[];
  compactionModel: string;
  targetModel: Model<TApi>;
  instructions: string;
  requestOptions: NativeCompactionRequestOptions;
  latestNativeCompaction: Extract<ReturnType<typeof resolveLatestNativeCompactionEntry>, { ok: true }>;
}): NativeCompactionRequestBuildResult {
  const compactedWindow = cloneCompactedWindow(args.latestNativeCompaction.entry.details?.compactedWindow ?? []);
  if (!compactedWindow) {
    return {
      ok: false,
      message: 'OpenAI native compaction could not clone the previous compacted window; Pi compaction was not run.',
    };
  }

  const liveTailEntries = args.branchEntries.slice(args.latestNativeCompaction.index + 1);
  return {
    ok: true,
    request: {
      model: args.compactionModel,
      input: [
        ...compactedWindow,
        ...serializeLiveTailToResponsesInput({ model: args.targetModel, entries: liveTailEntries }),
      ],
      instructions: args.instructions,
      ...args.requestOptions,
    },
    compactedKeptWindow: false,
    compactionModel: args.compactionModel,
  };
}

function buildRequestFromPreparation<TApi extends Api>(args: {
  branchEntries: readonly SessionEntry[];
  targetModel: Model<TApi>;
  event: SessionBeforeCompactEvent;
  instructions: string;
  requestOptions: NativeCompactionRequestOptions;
}): NativeCompactionRequestBuildResult {
  const request = serializeCompactionPreparationToRequest({
    model: args.targetModel,
    preparation: args.event.preparation,
    instructions: args.instructions,
    requestOptions: args.requestOptions,
  });
  if (request.input.length > 0) return successfulRequest(request, false, args.targetModel.id);

  return successfulRequest(
    {
      model: args.targetModel.id,
      input: serializeLiveTailToResponsesInput({ model: args.targetModel, entries: args.branchEntries }),
      instructions: args.instructions,
      ...args.requestOptions,
    },
    true,
    args.targetModel.id
  );
}

function successfulRequest(
  request: NativeCompactionRequestBody,
  compactedKeptWindow: boolean,
  compactionModel: string
): NativeCompactionRequestBuildResult {
  return { ok: true, request, compactedKeptWindow, compactionModel };
}
