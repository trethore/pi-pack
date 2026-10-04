import {
  cleanupSessionResources,
  normalizeContext,
  type Provider,
  type SimpleStreamOptions,
} from "@earendil-works/pi-ai";
import { openaiProvider } from "@earendil-works/pi-ai/providers/openai";
import { openaiCodexProvider } from "@earendil-works/pi-ai/providers/openai-codex";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { featureDecision, Feature } from "#src/compatibility";
import { transformPayload } from "#src/payload";
import type { Settings } from "#src/settings";
import { wrapOpenAIProvider } from "#src/transport";
import {
  codexBody,
  codexModel,
  codexResponse,
  codexToken,
  mockWebSockets,
  subscriptionModel,
} from "#test/codex-support";
import { model, settings } from "#test/support";

const { VERSION, host } = await vi.hoisted(async () => {
  const agent = await vi.importActual<typeof import("@earendil-works/pi-coding-agent")>(
    "@earendil-works/pi-coding-agent",
  );
  return { VERSION: agent.VERSION, host: { version: agent.VERSION } };
});
vi.mock("@earendil-works/pi-coding-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@earendil-works/pi-coding-agent")>()),
  get VERSION() {
    return host.version;
  },
}));

beforeEach(() => {
  host.version = VERSION;
});

const context = normalizeContext({ messages: [] });
const originalSet = Headers.prototype.set;
const disposers: Array<() => void> = [];

afterEach(() => {
  for (const dispose of disposers.splice(0)) {
    dispose();
  }
  cleanupSessionResources();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  expect(Headers.prototype.set).toBe(originalSet);
});

function harness(overrides: Partial<Settings> = {}, original: Provider = openaiCodexProvider()) {
  let current = settings(overrides);
  const warn = vi.fn();
  const wrapped = wrapOpenAIProvider(original, () => current, warn);
  disposers.push(wrapped.dispose);
  const requests: Array<{ url: string; headers: Headers; body: Record<string, unknown> }> = [];
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const request = input instanceof Request ? input : undefined;
    requests.push({
      url: String(input instanceof Request ? input.url : input),
      headers: new Headers(init?.headers ?? request?.headers),
      body: codexBody(init?.body ?? (request && (await request.text()))),
    });
    return codexResponse();
  });
  return {
    ...wrapped,
    warn,
    requests,
    fetch,
    update(next: Partial<Settings>) {
      current = { ...current, ...next };
    },
    async send(
      options: SimpleStreamOptions = {},
      requestModel = original.id === "openai" ? subscriptionModel : codexModel,
      detailed = false,
    ) {
      const requestOptions = {
        apiKey: codexToken,
        transport: "sse" as const,
        maxRetries: 0,
        fetch,
        onPayload: (payload: unknown) => transformPayload(payload, current, requestModel),
        ...options,
      };
      const stream = detailed
        ? wrapped.provider.stream(requestModel, context, requestOptions)
        : wrapped.provider.streamSimple(requestModel, context, requestOptions);
      const result = await stream.result();
      expect(result.stopReason, result.errorMessage).not.toBe("error");
      return result;
    },
  };
}

it.each([
  { name: "defaults", values: {}, originator: "pi", hint: false },
  { name: "priority", values: { serviceTier: "priority" }, originator: "pi", hint: true },
  { name: "originator", values: { codexOriginator: true }, originator: "codex-tui", hint: false },
  {
    name: "both",
    values: { serviceTier: "priority", codexOriginator: true },
    originator: "codex-tui",
    hint: true,
  },
  {
    name: "disabled",
    values: { enabled: false, serviceTier: "priority", codexOriginator: true },
    originator: "pi",
    hint: false,
  },
] satisfies Array<{ name: string; values: Partial<Settings>; originator: string; hint: boolean }>)(
  "sends the expected SSE headers for $name",
  async ({ values, originator, hint }) => {
    // Arrange
    const client = harness(values);
    const headers = Object.freeze({ "x-custom": "keep", originator: "custom" });

    // Act
    await client.send({ headers, sessionId: "session-test" });
    const sent = client.requests[0]!;

    // Assert
    expect(client.warn).not.toHaveBeenCalled();
    expect(sent.headers.get("originator")).toBe(originator);
    expect(sent.headers.get("x-codex-routing-hint")).toBe(hint ? `model=${codexModel.id};tier=priority` : null);
    expect(sent.body.service_tier).toBe(hint ? "priority" : undefined);
    expect(sent.headers.get("x-custom")).toBe("keep");
    expect(sent.headers.get("authorization")).toBe(`Bearer ${codexToken}`);
    expect(sent.headers.get("chatgpt-account-id")).toBe("test-account");
    expect(sent.headers.get("session-id")).toBe("session-test");
    expect(sent.body.prompt_cache_key).toBe("session-test");
    expect(sent.headers.get("user-agent")).toMatch(/^pi /);
    expect(headers).toEqual({ "x-custom": "keep", originator: "custom" });
  },
);

it("wraps detailed streams and preserves provider auth and catalog methods", async () => {
  // Arrange
  const original = openaiCodexProvider();
  const client = harness({ codexOriginator: true, serviceTier: "priority" }, original);

  // Act
  await client.send({}, codexModel, true);

  // Assert
  expect(client.provider.auth).toBe(original.auth);
  expect(client.provider.getModels).toBe(original.getModels);
  expect(client.requests[0]!.headers.get("originator")).toBe("codex-tui");
  expect(client.requests[0]!.body.service_tier).toBe("priority");
});

it("does not add a routing hint for a pre-existing priority body when the setting is default", async () => {
  // Arrange
  const client = harness();

  // Act
  await client.send({ onPayload: () => ({ model: codexModel.id, input: [], service_tier: "priority" }) });

  // Assert
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
});

it.each([
  { model: codexModel.id, input: [], service_tier: "default" },
  { model: "different-model", input: [], service_tier: "priority" },
  { model: codexModel.id, messages: [], service_tier: "priority" },
])("uses the final payload rather than a stale tier or model: %j", async (payload) => {
  // Arrange
  const client = harness({ serviceTier: "priority", codexOriginator: true });
  const onPayload = vi.fn(async () => ({ ...payload, stream: true }));

  // Act
  await client.send({ onPayload });

  // Assert
  expect(onPayload).toHaveBeenCalledOnce();
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
  if (payload.model !== codexModel.id || "messages" in payload) {
    expect(client.requests[0]!.headers.get("originator")).toBe("pi");
  }
});

it("accepts in-place payload edits and replaces case-insensitive routing headers", async () => {
  // Arrange
  const client = harness({ serviceTier: "priority" });
  const headers = { "X-Codex-Routing-Hint": "stale" };

  // Act
  await client.send({
    headers,
    onPayload(payload) {
      (payload as Record<string, unknown>).service_tier = "priority";
    },
  });

  // Assert
  expect(client.requests[0]!.headers.get("x-codex-routing-hint")).toBe(`model=${codexModel.id};tier=priority`);
  expect(headers).toEqual({ "X-Codex-Routing-Hint": "stale" });
});

it.each([false, true])("keeps priority compatibility checks with allowUnsupported=%s", async (allowUnsupported) => {
  // Arrange
  const client = harness({ serviceTier: "priority", codexOriginator: true, allowUnsupported });

  // Act
  await client.send({}, { ...codexModel, id: "unknown-model" });

  // Assert
  expect(client.requests[0]!.headers.get("originator")).toBe("codex-tui");
  expect(client.requests[0]!.headers.get("x-codex-routing-hint")).toBe(
    allowUnsupported ? "model=unknown-model;tier=priority" : null,
  );
});

it.each(["https://proxy.example/v1", "https://chatgpt.com.evil.example/backend-api"])(
  "leaves custom endpoint headers unchanged: %s",
  async (baseUrl) => {
    // Arrange
    const client = harness({ serviceTier: "priority", codexOriginator: true, allowUnsupported: true });

    // Act
    await client.send({}, { ...codexModel, baseUrl });

    // Assert
    expect(client.requests[0]!.headers.get("originator")).toBe("pi");
    expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
  },
);

it("does not allow model IDs to inject routing fields", async () => {
  // Arrange
  const client = harness({ serviceTier: "priority", allowUnsupported: true });

  // Act
  await client.send({}, { ...codexModel, id: "custom;tier=default" });

  // Assert
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
});

it("does not offer Codex identity on other APIs, even with allowUnsupported", () => {
  // Arrange
  const active = settings({ codexOriginator: true, allowUnsupported: true });

  // Act / Assert
  expect(featureDecision(Feature.CODEX_ORIGINATOR, active, model).apply).toBe(false);
  expect(featureDecision(Feature.CODEX_ORIGINATOR, active, codexModel).apply).toBe(true);
});

it("isolates simultaneous requests and unrelated Headers assignments", async () => {
  // Arrange
  const client = harness({ codexOriginator: true, serviceTier: "priority" });
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    entered.resolve();
    await resume.promise;
    expect(new Headers(init?.headers).get("originator")).toBe("codex-tui");
    return codexResponse();
  });

  // Act
  const pending = client.send({ fetch });
  await entered.promise;
  const unrelated = new Headers({ "chatgpt-account-id": "unrelated" });
  unrelated.set("originator", "pi");
  client.update({ codexOriginator: false, serviceTier: "default" });
  try {
    await client.send();
  } finally {
    resume.resolve();
    await pending;
  }

  // Assert
  expect(unrelated.get("originator")).toBe("pi");
  expect(client.requests[0]!.headers.get("originator")).toBe("pi");
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
});

it("restores the monkey patch after a synchronous stream failure", () => {
  // Arrange
  const original = openaiCodexProvider();
  const streamSimple = vi.fn(() => {
    throw new Error("stream failed");
  });
  const client = harness({ codexOriginator: true }, { ...original, streamSimple });

  // Act / Assert
  expect(() => client.provider.streamSimple(codexModel, context, { apiKey: codexToken })).toThrow("stream failed");
  expect(Headers.prototype.set).toBe(originalSet);
});

it("restores the monkey patch after an asynchronous payload failure", async () => {
  // Arrange
  const client = harness({ codexOriginator: true });

  // Act
  const result = await client.provider
    .streamSimple(codexModel, context, {
      apiKey: codexToken,
      onPayload() {
        throw new Error("payload failed");
      },
    })
    .result();

  // Assert
  expect(result.stopReason).toBe("error");
  expect(result.errorMessage).toContain("payload failed");
  expect(client.fetch).not.toHaveBeenCalled();
  expect(Headers.prototype.set).toBe(originalSet);
});

it("updates WebSocket handshake headers without changing the session or cache key", async () => {
  // Arrange
  const { Socket, sockets } = mockWebSockets();
  vi.stubGlobal("WebSocket", Socket);
  const client = harness();
  const options = { transport: "websocket" as const, sessionId: "websocket-session" };

  // Act
  await client.send(options);
  client.update({ codexOriginator: true, serviceTier: "priority" });
  await client.send(options);
  await client.send(options);
  client.update({ serviceTier: "default" });
  await client.send(options);
  client.update({ codexOriginator: false });
  await client.send(options);

  // Assert
  expect(client.fetch).not.toHaveBeenCalled();
  expect(sockets).toHaveLength(4);
  expect(sockets.map((socket) => socket.headers.get("originator"))).toEqual(["pi", "codex-tui", "codex-tui", "pi"]);
  expect(sockets.map((socket) => socket.headers.get("x-codex-routing-hint"))).toEqual([
    null,
    `model=${codexModel.id};tier=priority`,
    null,
    null,
  ]);
  expect(sockets[1]!.messages).toHaveLength(2);
  expect(sockets[1]!.messages[0]).toMatchObject({ service_tier: "priority", prompt_cache_key: options.sessionId });
  expect(sockets.every((socket) => socket.headers.get("session-id") === options.sessionId)).toBe(true);
  expect(sockets.slice(0, -1).every((socket) => socket.readyState === 3)).toBe(true);
});

it("uses the same overrides when WebSocket transport falls back to SSE", async () => {
  // Arrange
  vi.stubGlobal("WebSocket", undefined);
  const client = harness({ codexOriginator: true, serviceTier: "priority" });

  // Act
  await client.send({ transport: "auto" });

  // Assert
  expect(client.fetch).toHaveBeenCalledOnce();
  expect(client.requests[0]!.headers.get("originator")).toBe("codex-tui");
  expect(client.requests[0]!.headers.get("x-codex-routing-hint")).toBe(`model=${codexModel.id};tier=priority`);
});

it("keeps the patch until all overlapping opted-in requests finish", async () => {
  // Arrange
  const client = harness({ codexOriginator: true });
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  const fetch = vi.fn(async () => {
    entered.resolve();
    await resume.promise;
    return codexResponse();
  });

  // Act
  const pending = client.send({ fetch });
  await entered.promise;
  try {
    await client.send();
    expect(Headers.prototype.set).not.toBe(originalSet);
  } finally {
    resume.resolve();
    await pending;
  }

  // Assert
  expect(client.requests[0]!.headers.get("originator")).toBe("codex-tui");
  expect(Headers.prototype.set).toBe(originalSet);
});

it("does not rewrite unrelated headers constructed by payload hooks", async () => {
  // Arrange
  const client = harness({ codexOriginator: true });
  const unrelated = new Headers({ "chatgpt-account-id": "test-account" });

  // Act
  await client.send({
    onPayload() {
      unrelated.set("originator", "pi");
    },
  });

  // Assert
  expect(unrelated.get("originator")).toBe("pi");
  expect(client.requests[0]!.headers.get("originator")).toBe("codex-tui");
});

it("restores the patch when a pending request is aborted", async () => {
  // Arrange
  const client = harness({ codexOriginator: true });
  const controller = new AbortController();
  const fetch = vi.fn(() => {
    controller.abort();
    return Promise.reject(new DOMException("Aborted", "AbortError"));
  });

  // Act
  const result = await client.provider
    .streamSimple(codexModel, context, {
      apiKey: codexToken,
      signal: controller.signal,
      transport: "sse",
      fetch,
    })
    .result();

  // Assert
  expect(result.stopReason).toBe("aborted");
  expect(fetch).toHaveBeenCalledOnce();
  expect(Headers.prototype.set).toBe(originalSet);
});

it.each(["1.0.0", `${VERSION}+test`])(
  "warns once on Pi %s only when the legacy originator patch is used",
  async (version) => {
    // Arrange
    host.version = version;
    const client = harness();

    // Act
    await client.send();
    expect(client.warn).not.toHaveBeenCalled();
    client.update({ codexOriginator: true });
    await client.send();
    await client.send();

    // Assert
    expect(client.warn).toHaveBeenCalledOnce();
    expect(client.warn).toHaveBeenCalledWith(expect.stringContaining("pi-openai/codex-originator"));
    expect(client.warn).toHaveBeenCalledWith(expect.stringContaining(`tested with Pi ${VERSION}`));
    expect(client.warn).toHaveBeenCalledWith(expect.stringContaining(`running version is ${version}`));
    expect(client.requests[1]!.headers.get("originator")).toBe("codex-tui");
    expect(client.requests[2]!.headers.get("originator")).toBe("codex-tui");
  },
);

it("reports restoration failures instead of creating an unhandled rejection", async () => {
  // Arrange
  const client = harness({ codexOriginator: true });
  const defineProperty = Object.defineProperty;
  const spy = vi.spyOn(Object, "defineProperty").mockImplementation((target, key, descriptor) => {
    if (target === Headers.prototype && key === "set" && descriptor.value === originalSet) {
      throw new Error("Restoration blocked");
    }
    return defineProperty(target, key, descriptor);
  });

  try {
    // Act
    await client.send();

    // Assert
    expect(client.warn).toHaveBeenCalledWith(expect.stringContaining("could not be restored: Restoration blocked"));
    const unrelated = new Headers({ "chatgpt-account-id": "test-account" });
    unrelated.set("originator", "pi");
    expect(unrelated.get("originator")).toBe("pi");
  } finally {
    spy.mockRestore();
    defineProperty(Headers.prototype, "set", { value: originalSet });
  }
});

it.each([
  { name: "defaults", values: {}, originator: "custom", hint: "custom-hint" },
  {
    name: "priority",
    values: { serviceTier: "priority" },
    originator: "custom",
    hint: `model=${model.id};tier=priority`,
  },
  { name: "originator", values: { codexOriginator: true }, originator: "codex-tui", hint: "custom-hint" },
  {
    name: "both",
    values: { serviceTier: "priority", codexOriginator: true },
    originator: "codex-tui",
    hint: `model=${model.id};tier=priority`,
  },
  {
    name: "disabled",
    values: { enabled: false, serviceTier: "priority", codexOriginator: true },
    originator: "custom",
    hint: "custom-hint",
  },
] satisfies Array<{ name: string; values: Partial<Settings>; originator: string; hint: string }>)(
  "sends OpenAI subscription headers for $name without patching Headers",
  async ({ values, originator, hint }) => {
    // Arrange
    const client = harness(values, openaiProvider());
    const headers = Object.freeze({ Originator: "custom", "X-Codex-Routing-Hint": "custom-hint", "x-custom": "keep" });
    const fetch = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      expect(Headers.prototype.set).toBe(originalSet);
      return client.fetch(input, init);
    });

    // Act
    await client.send({ headers, fetch, sessionId: "subscription-session" });
    const sent = client.requests[0]!;

    // Assert
    expect(sent.url).toBe("https://api.openai.com/v1/responses");
    expect(sent.headers.get("originator")).toBe(originator);
    expect(sent.headers.get("x-codex-routing-hint")).toBe(hint);
    expect(sent.headers.get("authorization")).toBe(`Bearer ${codexToken}`);
    expect(sent.headers.get("x-custom")).toBe("keep");
    expect(sent.headers.get("user-agent")).toMatch(/^pi /);
    expect(sent.headers.get("session_id")).toBe("subscription-session");
    expect(sent.body.prompt_cache_key).toBe("subscription-session");
    expect(headers).toEqual({ Originator: "custom", "X-Codex-Routing-Hint": "custom-hint", "x-custom": "keep" });
    expect(client.warn).not.toHaveBeenCalled();
  },
);

it("uses each OpenAI request's effective credentials, including Authorization overrides", async () => {
  // Arrange
  const client = harness({ codexOriginator: true, serviceTier: "priority" }, openaiProvider());

  // Act
  await client.send({ apiKey: "sk-proj-test" });
  await client.send({ apiKey: "chatgpt-access-token" }, subscriptionModel, true);
  await client.send({ headers: { Authorization: "Bearer sk-other-key" } });
  await client.send({ apiKey: "sk-proj-test", headers: { Authorization: "Bearer chatgpt-override" } });
  await client.send({ headers: { Authorization: null } });
  await client.send({ headers: { Authorization: "Basic test" } });

  // Assert
  expect(client.requests.map(({ headers }) => headers.get("originator"))).toEqual([
    null,
    "codex-tui",
    null,
    "codex-tui",
    null,
    null,
  ]);
  expect(client.requests.map(({ headers }) => headers.get("x-codex-routing-hint"))).toEqual([
    null,
    `model=${model.id};tier=priority`,
    null,
    `model=${model.id};tier=priority`,
    null,
    null,
  ]);
  expect(client.requests.every(({ body }) => body.service_tier === "priority")).toBe(true);
});

it.each([
  { model: model.id, input: [], service_tier: "default" },
  { model: "different-model", input: [], service_tier: "priority" },
  { model: model.id, messages: [], service_tier: "priority" },
])("derives OpenAI subscription headers from the final payload: %j", async (payload) => {
  // Arrange
  const client = harness({ codexOriginator: true, serviceTier: "priority" }, openaiProvider());
  const onPayload = vi.fn(async () => ({ ...payload, stream: true }));

  // Act
  await client.send({ onPayload });

  // Assert
  expect(onPayload).toHaveBeenCalledOnce();
  expect(client.requests[0]!.headers.get("originator")).toBe(
    payload.model === model.id && "input" in payload ? "codex-tui" : null,
  );
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
});

it("does not infer OpenAI priority opt-in from an existing payload", async () => {
  // Arrange
  const client = harness({}, openaiProvider());

  // Act
  await client.send({ onPayload: () => ({ model: model.id, input: [], service_tier: "priority", stream: true }) });

  // Assert
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
});

it.each([
  { baseUrl: "https://proxy.example/v1" },
  { baseUrl: "https://api.openai.com.evil.example/v1" },
  { provider: "custom-openai" },
])("does not add subscription headers outside the official OpenAI route: %j", async (override) => {
  // Arrange
  const client = harness({ codexOriginator: true, serviceTier: "priority", allowUnsupported: true }, openaiProvider());

  // Act
  await client.send({}, { ...subscriptionModel, ...override });

  // Assert
  expect(client.requests[0]!.headers.has("originator")).toBe(false);
  expect(client.requests[0]!.headers.has("x-codex-routing-hint")).toBe(false);
});

it.each([false, true])(
  "keeps subscription priority support checks with allowUnsupported=%s",
  async (allowUnsupported) => {
    // Arrange
    const client = harness({ codexOriginator: true, serviceTier: "priority", allowUnsupported }, openaiProvider());

    // Act
    await client.send({}, { ...subscriptionModel, id: "unknown-model" });
    await client.send({}, { ...subscriptionModel, id: "custom;tier=default" });

    // Assert
    expect(client.requests.every(({ headers }) => headers.get("originator") === "codex-tui")).toBe(true);
    expect(client.requests[0]!.headers.get("x-codex-routing-hint")).toBe(
      allowUnsupported ? "model=unknown-model;tier=priority" : null,
    );
    expect(client.requests[1]!.headers.has("x-codex-routing-hint")).toBe(false);
  },
);

it.each([
  "https://api.openai.com/v1/responses",
  "https://proxy.example/v1/responses",
  "https://api.openai.com/v1/files",
])("preserves Request inputs and only decorates the Responses URL: %s", async (url) => {
  // Arrange
  const original: Provider = openaiProvider();
  const client = harness(
    { codexOriginator: true, serviceTier: "priority" },
    {
      ...original,
      streamSimple(requestModel, messages, options) {
        return original.streamSimple(requestModel, messages, {
          ...options,
          fetch(_input, init) {
            return options!.fetch!(new Request(url, init));
          },
        });
      },
    },
  );

  // Act
  await client.send();

  // Assert
  const sent = client.requests[0]!;
  expect(sent.url).toBe(url);
  expect(sent.body).toMatchObject({ model: model.id, service_tier: "priority" });
  expect(sent.headers.get("authorization")).toBe(`Bearer ${codexToken}`);
  const official = url === "https://api.openai.com/v1/responses";
  expect(sent.headers.get("originator")).toBe(official ? "codex-tui" : null);
  expect(sent.headers.get("x-codex-routing-hint")).toBe(official ? `model=${model.id};tier=priority` : null);
});

it("uses the default fetch and keeps overlapping subscription requests isolated", async () => {
  // Arrange
  const client = harness({ codexOriginator: true, serviceTier: "priority" }, openaiProvider());
  const entered = Promise.withResolvers<void>();
  const resume = Promise.withResolvers<void>();
  vi.stubGlobal("fetch", client.fetch);

  // Act
  const pending = client.provider
    .streamSimple(subscriptionModel, context, {
      apiKey: codexToken,
      async onPayload(payload) {
        entered.resolve();
        await resume.promise;
        (payload as Record<string, unknown>).service_tier = "priority";
      },
    })
    .result();
  await entered.promise;
  client.update({ codexOriginator: false, serviceTier: "default" });
  try {
    await client.provider.streamSimple(subscriptionModel, context, { apiKey: codexToken }).result();
  } finally {
    resume.resolve();
    await pending;
  }

  // Assert
  expect(client.requests.map(({ headers }) => headers.get("originator"))).toEqual([null, "codex-tui"]);
  expect(client.requests.map(({ headers }) => headers.get("x-codex-routing-hint"))).toEqual([
    null,
    `model=${model.id};tier=priority`,
  ]);
});
