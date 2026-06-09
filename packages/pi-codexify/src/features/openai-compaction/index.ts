import type { ExtensionAPI, ExtensionContext, SessionBeforeCompactEvent } from '@earendil-works/pi-coding-agent';
import { executeNativeCompaction } from '#pi-codexify/features/openai-compaction/core/client.js';
import {
  findLatestNativeCompactionEntry,
  findLatestNativeCompactionEntryIndex,
} from '#pi-codexify/features/openai-compaction/core/details-store.js';
import {
  buildNativeCompactionRequest,
  cloneCompactedWindow,
} from '#pi-codexify/features/openai-compaction/core/compaction-request.js';
import {
  createNativeCompactionInstallResult,
  formatCompactFailureMessage,
} from '#pi-codexify/features/openai-compaction/core/compaction-outcome.js';
import {
  resolveNativeCompactionEnvironment,
  type NativeCompactionEnvironmentFailure,
} from '#pi-codexify/features/openai-compaction/core/runtime.js';
import { rewriteResponsesPayloadWithNativeReplay } from '#pi-codexify/features/openai-compaction/replay/replay.js';
import { isOpenAIResponsesContext } from '#pi-codexify/features/openai-compaction/core/model.js';
import type { NativeCompactionEntry } from '#pi-codexify/features/openai-compaction/core/types.js';
import { injectPendingNativeWindowIntoPiCompactionRequest } from '#pi-codexify/features/openai-compaction/responses/pi-compaction-payload.js';
import type { OpenAICompactionConfig, OpenAICompactionReasoning } from '#pi-codexify/config/schema.js';
import { openaiCompactionReasoningValues } from '#pi-codexify/config/schema.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

export { injectPendingNativeWindowIntoPiCompactionRequest } from '#pi-codexify/features/openai-compaction/responses/pi-compaction-payload.js';

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
  if (openaiCompactionReasoningValues.includes(value as OpenAICompactionReasoning)) {
    return value as OpenAICompactionReasoning;
  }
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

async function handleCodexSessionBeforeCompactInner(
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
  state: OpenAICompactionState,
  pi: ExtensionAPI
) {
  if (!isOpenAIResponsesContext(ctx)) return;
  if (event.signal.aborted) return { cancel: true };

  const resolution = await resolveNativeCompactionEnvironment(ctx, { enabled: true });
  if (!resolution.ok) return handleCompactionEnvironmentFailure(ctx, resolution);

  const runtime = resolution.runtime;
  const branchEntries = ctx.sessionManager.getBranch();
  const requestBuild = buildNativeCompactionRequest({ pi, ctx, state, runtime, branchEntries, event });
  if (!requestBuild.ok) return cancelWithNotification(ctx, requestBuild.message);
  if (requestBuild.request.input.length === 0) return cancelWithNotification(ctx, emptySerializableInputMessage());

  const compactResult = await executeNativeCompaction({
    runtime,
    request: requestBuild.request,
    signal: event.signal,
  });
  if (!compactResult.ok) {
    if (compactResult.reason !== 'aborted') {
      notifyNativeCompactionFallback(ctx, state, branchEntries, runtime, formatCompactFailureMessage(compactResult));
    }
    return compactResult.reason === 'aborted' ? { cancel: true } : undefined;
  }

  const installResult = createNativeCompactionInstallResult({
    compactResult,
    request: requestBuild.request,
    runtime,
    event,
    compactionModel: requestBuild.compactionModel,
    compactedKeptWindow: requestBuild.compactedKeptWindow,
  });
  if (installResult.ok) return { compaction: installResult.compaction };

  notifyNativeCompactionFallback(ctx, state, branchEntries, runtime, installResult.fallbackMessage);
  return;
}

function handleCompactionEnvironmentFailure(ctx: ExtensionContext, resolution: NativeCompactionEnvironmentFailure) {
  if (resolution.reason === 'unsupported-provider' || resolution.reason === 'unsupported-api') return;
  ctx.ui.notify(
    `OpenAI native compaction is enabled but unavailable (${resolution.reason}); Pi compaction was not run.`,
    'error'
  );
  return { cancel: true };
}

function cancelWithNotification(ctx: ExtensionContext, message: string): { cancel: true } {
  ctx.ui.notify(message, 'error');
  return { cancel: true };
}

function emptySerializableInputMessage(): string {
  return 'OpenAI native compaction had no serializable conversation items; Pi compaction was not run.';
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
  if (latestNativeCompactionIndex === undefined || !runtime.payload) return undefined;

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
