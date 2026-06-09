import type { ExtensionAPI, ExtensionContext, SessionBeforeCompactEvent } from '@earendil-works/pi-coding-agent';
import { clampThinkingLevel, type ModelThinkingLevel, type Tool } from '@earendil-works/pi-ai';
import { executeNativeCompaction } from '#pi-codexify/features/openai-compaction/core/client.js';
import {
  extractCompactionSummaryText,
  hasCompactionOutputItem,
  sanitizeCompactedWindow,
  summarizeCompactionOutputForDiagnostics,
} from '#pi-codexify/features/openai-compaction/core/output.js';
import {
  findLatestNativeCompactionEntry,
  findLatestNativeCompactionEntryIndex,
  resolveLatestNativeCompactionEntry,
} from '#pi-codexify/features/openai-compaction/core/details-store.js';
import {
  rewriteResponsesPayloadWithNativeReplay,
  serializeLiveTailToResponsesInput,
} from '#pi-codexify/features/openai-compaction/replay/replay.js';
import {
  isResponsesCompatiblePayload,
  resolveNativeCompactionEnvironment,
  type ResponsesCompatibleRequestPayload,
} from '#pi-codexify/features/openai-compaction/core/runtime.js';
import { formatCodexUsageLimitError } from '#pi-codexify/features/openai-compaction/core/errors.js';
import { convertResponsesTools } from '#pi-codexify/features/openai-compaction/responses/openai-responses-conversion.js';
import {
  serializeCompactionPreparationToRequest,
  type NativeCompactionRequestBody,
  type NativeCompactionRequestOptions,
  type ResponsesInputItem,
} from '#pi-codexify/features/openai-compaction/core/serializer.js';
import {
  createNativeCompactionDetails,
  createNativeCompactionShimResult,
  NATIVE_COMPACTION_SHIM_SUMMARY,
  type NativeCompactionEntry,
} from '#pi-codexify/features/openai-compaction/core/types.js';
import { isOpenAIResponsesContext } from '#pi-codexify/features/openai-compaction/core/model.js';
import type { OpenAICompactionConfig, OpenAICompactionReasoning } from '#pi-codexify/config/schema.js';
import { openaiCompactionReasoningValues } from '#pi-codexify/config/schema.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

export interface OpenAICompactionController {
  getConfig(): OpenAICompactionConfig;
  updateEnabled(value: boolean): void;
  updateModel(value: string): void;
  updateReasoning(value: OpenAICompactionReasoning): void;
}

export function registerOpenAICompaction(pi: ExtensionAPI, config: OpenAICompactionConfig): OpenAICompactionController {
  const state: OpenAICompactionState = { config };

  pi.on('session_before_compact', (event, ctx) => handleOpenAICompactionSessionBeforeCompact(event, ctx, state, pi));
  pi.on('before_provider_request', async (event, ctx) => {
    if (!state.config.enabled) return;
    const piCompactionPayload = await injectPendingNativeWindowIntoPiCompactionRequest(event.payload, ctx, state);
    if (piCompactionPayload !== undefined) return piCompactionPayload;
    return rewriteOpenAICompactedProviderRequest(event.payload, ctx, state);
  });

  return {
    getConfig() {
      return state.config;
    },
    updateEnabled(value) {
      state.config = { ...state.config, enabled: value };
      if (!value) state.pendingPiCompactionNativeWindow = undefined;
    },
    updateModel(value) {
      state.config = { ...state.config, model: value };
    },
    updateReasoning(value) {
      state.config = { ...state.config, reasoning: value };
    },
  };
}

export function parseOpenAICompactionReasoning(value: string): OpenAICompactionReasoning | undefined {
  if (openaiCompactionReasoningValues.includes(value as OpenAICompactionReasoning))
    return value as OpenAICompactionReasoning;
  return undefined;
}

export function buildOpenAICompactionStatusMessage(
  config: OpenAICompactionConfig,
  model: { provider?: string; id?: string; api?: string } | undefined
): string {
  const modelLabel = model ? `${model.provider}/${model.id}` : 'none';
  return [
    'OpenAI compaction',
    `enabled: ${config.enabled ? 'yes' : 'no'}`,
    `model: ${config.model}`,
    `reasoning: ${config.reasoning}`,
    `current model: ${modelLabel}`,
    `supported here: ${model?.provider === 'openai' && model.api === 'openai-responses' ? 'yes' : 'no'}`,
  ].join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function stashLatestNativeWindowForPiCompactionFallback(
  ctx: ExtensionContext,
  branchEntries: ReturnType<ExtensionContext['sessionManager']['getBranch']>,
  runtime: { provider: string; api: string; baseUrl: string },
  state: OpenAICompactionState
): boolean {
  state.pendingPiCompactionNativeWindow = undefined;
  const nativeEntry = findLatestNativeCompactionEntry(branchEntries, {
    provider: runtime.provider,
    api: runtime.api,
    baseUrl: runtime.baseUrl,
  });
  const compactedWindow = cloneCompactedWindow(nativeEntry?.details?.compactedWindow ?? []);
  if (!compactedWindow || compactedWindow.length === 0) return false;
  state.pendingPiCompactionNativeWindow = {
    window: compactedWindow,
    provider: runtime.provider,
    api: runtime.api,
    baseUrl: runtime.baseUrl,
    sessionId: ctx.sessionManager.getSessionId(),
  };
  return true;
}

function cloneCompactedWindow(window: readonly unknown[]): ResponsesInputItem[] | undefined {
  if (!window.every(isRecord)) return undefined;
  return window.map((item) => structuredClone(item));
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
  if (tools.length === 0) return undefined;
  return convertResponsesTools(tools, { strict: null });
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
  const rawEffort = model.thinkingLevelMap?.[clampedLevel] ?? clampedLevel;
  const effort = rawEffort;
  return effort === null ? undefined : { effort, summary: 'auto' };
}

const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64;

function clampOpenAIPromptCacheKey(key: string): string {
  const chars = [...key];
  if (chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return key;
  return chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join('');
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

function formatCompactFailureMessage(compactResult: Awaited<ReturnType<typeof executeNativeCompaction>>): string {
  if (compactResult.ok) return 'OpenAI native compaction succeeded';
  const status = compactResult.status ? ` HTTP ${compactResult.status}` : '';
  const friendly = formatCodexUsageLimitError(
    compactResult.responseJson ?? compactResult.responseText ?? compactResult.errorMessage
  );
  if (friendly) return `OpenAI native compaction failed (${compactResult.reason}${status}): ${friendly}`;
  const response = compactResult.responseText?.trim();
  const detail = formatCompactFailureDetail(response, compactResult.errorMessage);
  return `OpenAI native compaction failed (${compactResult.reason}${status})${detail}`;
}

function formatCompactFailureDetail(response: string | undefined, errorMessage: string | undefined): string {
  if (response) return `: ${response.slice(0, 500)}`;
  return errorMessage ? `: ${errorMessage}` : '';
}

function formatCompactRequestDiagnostics(request: NativeCompactionRequestBody): string {
  const reasoning =
    isRecord(request.reasoning) && typeof request.reasoning['effort']! === 'string'
      ? request.reasoning['effort']!
      : 'none';
  const serviceTier = typeof request.service_tier === 'string' ? request.service_tier : 'none';
  const tools = Array.isArray(request.tools) ? request.tools.length : 0;
  return `model=${request.model}, input=${request.input.length}, tools=${tools}, reasoning=${reasoning}, service_tier=${serviceTier}`;
}

function notifyNativeCompactionFallback(
  ctx: ExtensionContext,
  state: OpenAICompactionState,
  branchEntries: ReturnType<ExtensionContext['sessionManager']['getBranch']>,
  runtime: { provider: string; api: string; baseUrl: string },
  message: string
): void {
  const stashed = stashLatestNativeWindowForPiCompactionFallback(ctx, branchEntries, runtime, state);
  ctx.ui.notify(
    `${message}; Pi compaction will run.${stashed ? ' Previous native compacted window will be included in Pi compaction fallback.' : ''}`,
    'error'
  );
}

function textFromResponsesContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((item) =>
      isRecord(item) && item['type'] === 'input_text' && typeof item['text']! === 'string' ? item['text']! : ''
    )
    .join('\n');
}

function isPiCompactionSummarizationPayload(payload: ResponsesCompatibleRequestPayload): boolean {
  const instructions = typeof payload.instructions === 'string' ? payload.instructions : '';
  if (/compact|summar/i.test(instructions)) return true;

  return payload.input.some((item) => {
    if (!isRecord(item)) return false;
    const role = item['role']!;
    const text = textFromResponsesContent(item['content']!);
    if ((role === 'system' || role === 'developer') && /compact|summar/i.test(text)) return true;
    if (role === 'user' && /<conversation>|previous compaction summary|summary/i.test(text)) return true;
    return false;
  });
}

export async function handleOpenAICompactionSessionBeforeCompact(
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
  state: OpenAICompactionState,
  pi: ExtensionAPI
) {
  if (!state.config.enabled) return;

  try {
    return await handleCodexSessionBeforeCompactInner(event, ctx, state, pi);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.ui.notify(`OpenAI native compaction failed unexpectedly: ${message}; Pi compaction was not run.`, 'error');
    return { cancel: true };
  }
}

// eslint-disable-next-line complexity
async function handleCodexSessionBeforeCompactInner(
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
  state: OpenAICompactionState,
  pi: ExtensionAPI
) {
  if (!isOpenAIResponsesContext(ctx)) return;
  if (event.signal.aborted) return { cancel: true };

  const resolution = await resolveNativeCompactionEnvironment(ctx, { enabled: true });
  if (!resolution.ok) {
    if (resolution.reason === 'unsupported-provider' || resolution.reason === 'unsupported-api') {
      return;
    }
    ctx.ui.notify(
      `OpenAI native compaction is enabled but unavailable (${resolution.reason}); Pi compaction was not run.`,
      'error'
    );
    return { cancel: true };
  }

  const runtime = resolution.runtime;
  const compactionModel = state.config.model;
  const compactionTargetModel = { ...runtime.currentModel, id: compactionModel };
  const requestOptions = buildCompactionRequestOptions(pi, ctx, state);
  const branchEntries = ctx.sessionManager.getBranch();
  const latestNativeCompaction = resolveLatestNativeCompactionEntry(branchEntries, {
    provider: runtime.provider,
    api: runtime.api,
    baseUrl: runtime.baseUrl,
  });

  let request: NativeCompactionRequestBody;
  let compactedKeptWindow = false;
  if (latestNativeCompaction.ok) {
    const compactedWindow = cloneCompactedWindow(latestNativeCompaction.entry.details?.compactedWindow ?? []);
    if (!compactedWindow) {
      ctx.ui.notify(
        'OpenAI native compaction could not clone the previous compacted window; Pi compaction was not run.',
        'error'
      );
      return { cancel: true };
    }
    const liveTailEntries = branchEntries.slice(latestNativeCompaction.index + 1);
    request = {
      model: compactionModel,
      input: [
        ...compactedWindow,
        ...serializeLiveTailToResponsesInput({ model: compactionTargetModel, entries: liveTailEntries }),
      ],
      instructions: buildCompactionInstructions(ctx.getSystemPrompt(), event.customInstructions),
      ...requestOptions,
    };
  } else if (latestNativeCompaction.reason === 'no-compaction') {
    request = serializeCompactionPreparationToRequest({
      model: compactionTargetModel,
      preparation: event.preparation,
      instructions: buildCompactionInstructions(ctx.getSystemPrompt(), event.customInstructions),
      requestOptions,
    });
    if (request.input.length === 0) {
      request = {
        model: compactionModel,
        input: serializeLiveTailToResponsesInput({ model: compactionTargetModel, entries: branchEntries }),
        instructions: buildCompactionInstructions(ctx.getSystemPrompt(), event.customInstructions),
        ...requestOptions,
      };
      compactedKeptWindow = true;
    }
  } else {
    request = serializeCompactionPreparationToRequest({
      model: compactionTargetModel,
      preparation: event.preparation,
      instructions: buildCompactionInstructions(ctx.getSystemPrompt(), event.customInstructions),
      requestOptions,
    });
    if (request.input.length === 0) {
      request = {
        model: compactionModel,
        input: serializeLiveTailToResponsesInput({ model: compactionTargetModel, entries: branchEntries }),
        instructions: buildCompactionInstructions(ctx.getSystemPrompt(), event.customInstructions),
        ...requestOptions,
      };
      compactedKeptWindow = true;
    }
  }

  if (request.input.length === 0) {
    ctx.ui.notify(
      'OpenAI native compaction had no serializable conversation items; Pi compaction was not run.',
      'error'
    );
    return { cancel: true };
  }

  const compactResult = await executeNativeCompaction({ runtime, request, signal: event.signal });
  if (!compactResult.ok) {
    if (compactResult.reason !== 'aborted') {
      notifyNativeCompactionFallback(ctx, state, branchEntries, runtime, formatCompactFailureMessage(compactResult));
    }
    return compactResult.reason === 'aborted' ? { cancel: true } : undefined;
  }
  const compactedWindow = sanitizeCompactedWindow(compactResult.compactedWindow);
  if (compactedWindow.length === 0) {
    notifyNativeCompactionFallback(
      ctx,
      state,
      branchEntries,
      runtime,
      `OpenAI native compaction returned no installable compacted context. Request: ${formatCompactRequestDiagnostics(request)}. Output: ${summarizeCompactionOutputForDiagnostics(compactResult.compactedWindow, compactedWindow)}`
    );
    return;
  }
  if (!hasCompactionOutputItem(compactedWindow)) {
    notifyNativeCompactionFallback(
      ctx,
      state,
      branchEntries,
      runtime,
      `OpenAI native compaction did not return a compaction item. Response=${compactResult.compactResponseId ?? '<none>'}. Request: ${formatCompactRequestDiagnostics(request)}. Output: ${summarizeCompactionOutputForDiagnostics(compactResult.compactedWindow, compactedWindow)}`
    );
    return;
  }
  const encryptedSummary = extractCompactionSummaryText(compactedWindow);
  if (!encryptedSummary) {
    notifyNativeCompactionFallback(
      ctx,
      state,
      branchEntries,
      runtime,
      `OpenAI native compaction returned compacted context without a displayable summary. Response=${compactResult.compactResponseId ?? '<none>'}. Request: ${formatCompactRequestDiagnostics(request)}. Output: ${summarizeCompactionOutputForDiagnostics(compactResult.compactedWindow, compactedWindow)}`
    );
    return;
  }
  try {
    const details = createNativeCompactionDetails({
      provider: runtime.provider,
      api: runtime.api,
      model: compactionModel,
      baseUrl: runtime.baseUrl,
      compactedWindow,
      compactResponseId: compactResult.compactResponseId,
      createdAt: compactResult.createdAt,
      requestMeta: {
        tokensBefore: event.preparation.tokensBefore,
        previousSummaryPresent: Boolean(event.preparation.previousSummary),
        compactedKeptWindow,
      },
    });
    return {
      compaction: createNativeCompactionShimResult({
        summary: NATIVE_COMPACTION_SHIM_SUMMARY,
        firstKeptEntryId: event.preparation.firstKeptEntryId,
        tokensBefore: event.preparation.tokensBefore,
        details,
      }),
    };
  } catch {
    notifyNativeCompactionFallback(
      ctx,
      state,
      branchEntries,
      runtime,
      'OpenAI native compaction produced details Pi could not store'
    );
    return;
  }
}

export async function rewriteOpenAICompactedProviderRequest(
  payload: unknown,
  ctx: ExtensionContext,
  state: OpenAICompactionState
): Promise<unknown | undefined> {
  if (!state.config.enabled || !isOpenAIResponsesContext(ctx)) return undefined;
  const resolution = await resolveNativeCompactionEnvironment(ctx, { enabled: true }, payload);
  if (!resolution.ok) return undefined;
  const runtime = resolution.runtime;
  const branchEntries = ctx.sessionManager.getBranch();
  const latestNativeCompactionIndex = findLatestNativeCompactionEntryIndex(branchEntries, {
    provider: runtime.provider,
    api: runtime.api,
    baseUrl: runtime.baseUrl,
  });
  if (latestNativeCompactionIndex === undefined) return undefined;
  if (!runtime.payload) return undefined;
  const rewrite = rewriteResponsesPayloadWithNativeReplay({
    model: runtime.currentModel,
    payload: runtime.payload,
    branchEntries,
    compactionEntry: branchEntries[latestNativeCompactionIndex]! as NativeCompactionEntry,
  });
  if (rewrite.ok) return rewrite.rewrittenPayload;
  const detail = rewrite.parity?.mismatches.slice(0, 3).join('; ');
  const message = `OpenAI native compaction replay failed (${rewrite.reason})${detail ? `: ${detail}` : ''}; request was not sent with placeholder compaction context.`;
  ctx.ui.notify(message, 'error');
  throw new Error(message);
}

// eslint-disable-next-line complexity
export async function injectPendingNativeWindowIntoPiCompactionRequest(
  payload: unknown,
  ctx: ExtensionContext,
  state: OpenAICompactionState
): Promise<unknown | undefined> {
  const pending = state.pendingPiCompactionNativeWindow;
  if (!pending || pending.window.length === 0) return undefined;
  if (!isResponsesCompatiblePayload(payload)) return undefined;
  if (pending.sessionId !== ctx.sessionManager.getSessionId()) {
    state.pendingPiCompactionNativeWindow = undefined;
    return undefined;
  }
  if (!isPiCompactionSummarizationPayload(payload)) return undefined;

  const resolution = await resolveNativeCompactionEnvironment(ctx, { enabled: true }, payload);
  if (!resolution.ok) return undefined;
  const runtime = resolution.runtime;
  if (pending.provider !== runtime.provider || pending.api !== runtime.api || pending.baseUrl !== runtime.baseUrl) {
    state.pendingPiCompactionNativeWindow = undefined;
    return undefined;
  }

  const input = [...payload.input];
  let insertAt = 0;
  while (insertAt < input.length) {
    const item = input[insertAt]!;
    if (!isRecord(item) || (item['role'] !== 'system' && item['role'] !== 'developer')) break;
    insertAt++;
  }

  state.pendingPiCompactionNativeWindow = undefined;
  return {
    ...payload,
    input: [
      ...input.slice(0, insertAt),
      ...pending.window.map((item) => structuredClone(item)),
      ...input.slice(insertAt),
    ],
  };
}
