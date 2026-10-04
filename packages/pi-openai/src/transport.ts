import {
  cleanupSessionResources,
  type AssistantMessageEventStream,
  type Provider,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { Feature, featureDecision, isCodexModel, type RequestModel } from "#src/compatibility";
import { ServiceTier } from "#src/constants";
import { withCodexOriginator } from "#src/originator";
import { matchesRequest } from "#src/payload";
import type { Settings } from "#src/settings";

const routingHeader = "x-codex-routing-hint";

function priorityRoutingHint(
  body: Record<string, unknown>,
  settings: Settings | undefined,
  model: RequestModel,
): string | undefined {
  if (
    !settings ||
    !featureDecision(Feature.SERVICE_TIER, settings, model).apply ||
    body.service_tier !== ServiceTier.PRIORITY ||
    !/^[a-zA-Z0-9._:/-]+$/.test(model.id)
  ) {
    return undefined;
  }
  return `model=${model.id};tier=priority`;
}

export function wrapCodexProvider(
  provider: Provider,
  getSettings: () => Settings | undefined,
  warn: (message: string) => void,
): { provider: Provider; dispose(): void } {
  const sessions = new Map<string, string>();

  function updateSession(sessionId: string | undefined, originator: boolean, routingHint: string | undefined): void {
    if (!sessionId) {
      return;
    }
    const profile = originator || routingHint ? `${String(originator)}:${routingHint ?? ""}` : undefined;
    if (sessions.get(sessionId) === profile) {
      return;
    }
    // Handshake headers cannot change on an already-open WebSocket.
    cleanupSessionResources(sessionId);
    if (profile === undefined) {
      sessions.delete(sessionId);
    } else {
      sessions.set(sessionId, profile);
    }
  }

  function request<T extends StreamOptions>(
    model: RequestModel,
    options: T | undefined,
    start: (options: T | undefined) => AssistantMessageEventStream,
  ): AssistantMessageEventStream {
    if (!isCodexModel(model) || !options) {
      return start(options);
    }
    const settings = getSettings();
    const changeOriginator = settings !== undefined && featureDecision(Feature.CODEX_ORIGINATOR, settings, model).apply;
    const originator = { enabled: changeOriginator };
    const headers = { ...options.headers };
    const requestOptions: T = {
      ...options,
      headers,
      async onPayload(payload, requestModel) {
        originator.enabled = false;
        const replacement = await options.onPayload?.(payload, requestModel);
        const body = replacement === undefined ? payload : replacement;
        const matches = matchesRequest(body, model);
        originator.enabled = changeOriginator && matches;
        const routingHint = matches ? priorityRoutingHint(body, settings, model) : undefined;
        if (routingHint) {
          for (const name of Object.keys(headers)) {
            if (name.toLowerCase() === routingHeader) {
              Reflect.deleteProperty(headers, name);
            }
          }
          headers[routingHeader] = routingHint;
        }
        updateSession(options.sessionId, originator.enabled, routingHint);
        return replacement;
      },
    };
    return withCodexOriginator(originator, () => start(requestOptions), warn);
  }

  return {
    provider: {
      ...provider,
      stream(model, context, options) {
        return request(model, options, (next) => provider.stream(model, context, next));
      },
      streamSimple(model, context, options) {
        return request(model, options, (next) => provider.streamSimple(model, context, next));
      },
    } satisfies Provider,
    dispose() {
      for (const sessionId of sessions.keys()) {
        cleanupSessionResources(sessionId);
      }
      sessions.clear();
    },
  };
}
