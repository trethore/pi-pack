import {
  cleanupSessionResources,
  type AssistantMessageEventStream,
  type Provider,
  type StreamOptions,
} from "@earendil-works/pi-ai";
import { Feature, featureDecision, isCodexModel, isOpenAIResponsesModel, type RequestModel } from "#src/compatibility";
import { ServiceTier } from "#src/constants";
import { withCodexOriginator } from "#src/originator";
import { matchesRequest } from "#src/payload";
import type { Settings } from "#src/settings";

const routingHeader = "x-codex-routing-hint";

function subscriptionHeaders(input: string | URL | Request, init: RequestInit | undefined): Headers | undefined {
  const url = new URL(input instanceof Request ? input.url : input);
  if (url.origin !== "https://api.openai.com" || url.pathname !== "/v1/responses") {
    return undefined;
  }
  const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
  // Pi treats non-sk bearer tokens as ChatGPT sign-in. Check outgoing auth so overrides win.
  if (!/^Bearer\s+(?!sk-)\S+$/i.test(headers.get("authorization") ?? "")) {
    return undefined;
  }
  return headers;
}

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

export function wrapOpenAIProvider(
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
    const legacy = isCodexModel(model);
    const openai = isOpenAIResponsesModel(model);
    if ((!legacy && !openai) || !options) {
      return start(options);
    }
    const settings = getSettings();
    const changeOriginator =
      settings !== undefined && featureDecision(Feature.CODEX_ORIGINATOR, settings, model, openai).apply;
    const originator = { enabled: legacy && changeOriginator };
    let routingHint: string | undefined;
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
        routingHint = matches ? priorityRoutingHint(body, settings, model) : undefined;
        if (legacy && routingHint) {
          for (const name of Object.keys(headers)) {
            if (name.toLowerCase() === routingHeader) {
              Reflect.deleteProperty(headers, name);
            }
          }
          headers[routingHeader] = routingHint;
        }
        if (legacy) {
          updateSession(options.sessionId, originator.enabled, routingHint);
        }
        return replacement;
      },
    };
    if (legacy) {
      return withCodexOriginator(originator, () => start(requestOptions), warn);
    }
    const fetch = options.fetch ?? globalThis.fetch;
    requestOptions.fetch = (input, init) => {
      if (!originator.enabled && !routingHint) {
        return fetch(input, init);
      }
      const outgoingHeaders = subscriptionHeaders(input, init);
      if (!outgoingHeaders) {
        return fetch(input, init);
      }
      if (originator.enabled) {
        outgoingHeaders.set("originator", "codex-tui");
      }
      if (routingHint) {
        outgoingHeaders.set(routingHeader, routingHint);
      }
      return fetch(input, { ...init, headers: outgoingHeaders });
    };
    return start(requestOptions);
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
