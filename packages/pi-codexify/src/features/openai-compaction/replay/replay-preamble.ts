import type { ResponsesCompatibleRequestPayload } from '#pi-codexify/features/openai-compaction/core/runtime.js';
import type { ResponsesInputMessageItem } from '#pi-codexify/features/openai-compaction/core/serializer.js';
import {
  cloneResponsesInputMessageItem,
  isPreambleRole,
  isResponsesInputMessageItem,
} from '#pi-codexify/features/openai-compaction/replay/replay-structured.js';

export type FreshAuthoritativePreamble = {
  instructions?: string | undefined;
  leadingInput: ResponsesInputMessageItem[];
  trailingInput: ResponsesInputMessageItem[];
};

function isPromptEnvelopeItem(item: unknown): item is ResponsesInputMessageItem {
  return isResponsesInputMessageItem(item) && isPreambleRole(item.role);
}

export function extractFreshAuthoritativePreamble(
  payload: ResponsesCompatibleRequestPayload
): FreshAuthoritativePreamble | undefined {
  if (payload.instructions !== undefined && typeof payload.instructions !== 'string') return undefined;

  let leadingBoundary = 0;
  while (leadingBoundary < payload.input.length && isPromptEnvelopeItem(payload.input[leadingBoundary]!))
    leadingBoundary += 1;

  let trailingBoundary = payload.input.length;
  while (trailingBoundary > leadingBoundary && isPromptEnvelopeItem(payload.input[trailingBoundary - 1]!))
    trailingBoundary -= 1;

  for (let index = leadingBoundary; index < trailingBoundary; index++) {
    if (isPromptEnvelopeItem(payload.input[index]!)) return undefined;
  }

  return {
    ...(typeof payload.instructions === 'string' ? { instructions: payload.instructions } : {}),
    leadingInput: payload.input
      .slice(0, leadingBoundary)
      .map((item) => cloneResponsesInputMessageItem(item as ResponsesInputMessageItem)),
    trailingInput: payload.input
      .slice(trailingBoundary)
      .map((item) => cloneResponsesInputMessageItem(item as ResponsesInputMessageItem)),
  };
}
