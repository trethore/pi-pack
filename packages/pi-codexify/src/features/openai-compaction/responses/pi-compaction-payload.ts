import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  isResponsesCompatiblePayload,
  resolveNativeCompactionEnvironment,
  type ResponsesCompatibleRequestPayload,
} from '#pi-codexify/features/openai-compaction/core/runtime.js';
import { isRecord } from '#pi-codexify/features/openai-compaction/core/structured.js';
import type { OpenAICompactionState } from '#pi-codexify/features/openai-compaction/state.js';

const COMPACTION_TEXT_PATTERN = /compact|summar/i;
const USER_COMPACTION_PAYLOAD_PATTERN = /<conversation>|previous compaction summary|summary/i;

export async function injectPendingNativeWindowIntoPiCompactionRequest(
  payload: unknown,
  ctx: ExtensionContext,
  state: OpenAICompactionState
): Promise<unknown | undefined> {
  const pending = state.pendingPiCompactionNativeWindow;
  if (!pending || pending.window.length === 0) return undefined;
  if (!isResponsesCompatiblePayload(payload)) return undefined;
  if (!isPendingWindowForCurrentSession(ctx, state)) return undefined;
  if (!isPiCompactionSummarizationPayload(payload)) return undefined;

  const resolution = await resolveNativeCompactionEnvironment(ctx, { enabled: true }, payload);
  if (!resolution.ok) return undefined;
  if (!isPendingWindowForRuntime(state, resolution.runtime)) return undefined;

  state.pendingPiCompactionNativeWindow = undefined;
  return insertNativeWindowAfterPreamble(payload, pending.window);
}

function isPendingWindowForCurrentSession(ctx: ExtensionContext, state: OpenAICompactionState): boolean {
  const pending = state.pendingPiCompactionNativeWindow;
  if (pending?.sessionId === ctx.sessionManager.getSessionId()) return true;
  state.pendingPiCompactionNativeWindow = undefined;
  return false;
}

function isPendingWindowForRuntime(
  state: OpenAICompactionState,
  runtime: { provider: string; api: string; baseUrl: string }
): boolean {
  const pending = state.pendingPiCompactionNativeWindow;
  if (pending?.provider === runtime.provider && pending.api === runtime.api && pending.baseUrl === runtime.baseUrl) {
    return true;
  }
  state.pendingPiCompactionNativeWindow = undefined;
  return false;
}

function isPiCompactionSummarizationPayload(payload: ResponsesCompatibleRequestPayload): boolean {
  const instructions = typeof payload.instructions === 'string' ? payload.instructions : '';
  return (
    COMPACTION_TEXT_PATTERN.test(instructions) ||
    payload.input.some((item) => isPiCompactionSummarizationInputItem(item))
  );
}

function isPiCompactionSummarizationInputItem(item: unknown): boolean {
  if (!isRecord(item)) return false;
  const role = item['role'];
  const text = textFromResponsesContent(item['content']);
  if ((role === 'system' || role === 'developer') && COMPACTION_TEXT_PATTERN.test(text)) return true;
  return role === 'user' && USER_COMPACTION_PAYLOAD_PATTERN.test(text);
}

function textFromResponsesContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map((item) => textFromResponsesContentItem(item)).join('\n');
}

function textFromResponsesContentItem(item: unknown): string {
  return isRecord(item) && item['type'] === 'input_text' && typeof item['text'] === 'string' ? item['text'] : '';
}

function insertNativeWindowAfterPreamble(
  payload: ResponsesCompatibleRequestPayload,
  nativeWindow: readonly Record<string, unknown>[]
): ResponsesCompatibleRequestPayload {
  const insertAt = findAfterPreambleIndex(payload.input);
  return {
    ...payload,
    input: [
      ...payload.input.slice(0, insertAt),
      ...nativeWindow.map((item) => structuredClone(item)),
      ...payload.input.slice(insertAt),
    ],
  };
}

function findAfterPreambleIndex(input: readonly unknown[]): number {
  let index = 0;
  while (index < input.length && isPreambleInputItem(input[index])) index++;
  return index;
}

function isPreambleInputItem(item: unknown): boolean {
  return isRecord(item) && (item['role'] === 'system' || item['role'] === 'developer');
}
