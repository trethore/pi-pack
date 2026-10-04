import { AsyncLocalStorage } from "node:async_hooks";
import type { AssistantMessageEventStream } from "@earendil-works/pi-ai";
import { createPiMethodPatch } from "@pi-pack/shared/unsafe";

interface OriginatorScope {
  enabled: boolean;
}

const scope = new AsyncLocalStorage<OriginatorScope>();
const patchId = "pi-openai/codex-originator";
const patch = createPiMethodPatch({
  id: patchId,
  testedPiVersion: "1.0.0",
  target: Headers.prototype,
  key: "set",
  wrap(original) {
    // Pi overwrites custom originator headers for both SSE and WebSockets.
    // Only intercept that assignment inside this extension's Codex request scope.
    return function set(this: Headers, name: string, value: string): void {
      if (
        scope.getStore()?.enabled &&
        name.toLowerCase() === "originator" &&
        value === "pi" &&
        this.has("chatgpt-account-id")
      ) {
        value = "codex-tui";
      }
      original.call(this, name, value);
    };
  },
});

export function withCodexOriginator(
  request: OriginatorScope,
  start: () => AssistantMessageEventStream,
  warn: (message: string) => void,
): AssistantMessageEventStream {
  if (!request.enabled) {
    return scope.run(request, start);
  }
  const restore = patch.acquire(warn);
  const release = () => {
    request.enabled = false;
    try {
      restore();
    } catch (error) {
      warn(
        `Unsafe Pi patch "${patchId}" could not be restored: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  };
  try {
    const stream = scope.run(request, start);
    void stream.result().then(release, release);
    return stream;
  } catch (error) {
    release();
    throw error;
  }
}
