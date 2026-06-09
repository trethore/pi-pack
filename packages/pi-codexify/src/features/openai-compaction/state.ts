import type { OpenAICompactionConfig } from '#pi-codexify/config/schema.js';
import type { ResponsesInputItem } from '#pi-codexify/features/openai-compaction/core/serializer.js';

export interface PendingPiCompactionNativeWindow {
  window: ResponsesInputItem[];
  provider: string;
  api: string;
  baseUrl: string;
  sessionId: string;
}

export interface OpenAICompactionState {
  config: OpenAICompactionConfig;
  pendingPiCompactionNativeWindow?: PendingPiCompactionNativeWindow | undefined;
}
