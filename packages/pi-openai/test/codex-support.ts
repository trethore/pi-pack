import { zstdDecompressSync } from "node:zlib";
import type { Model } from "@earendil-works/pi-ai";
import { model } from "#test/support";

export const codexModel: Model<"openai-codex-responses"> = {
  ...model,
  provider: "openai-codex",
  api: "openai-codex-responses",
  baseUrl: "https://chatgpt.com/backend-api",
  name: model.id,
  input: ["text"],
  contextWindow: 128000,
  maxTokens: 4096,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};

const claims = { "https://api.openai.com/auth": { chatgpt_account_id: "test-account" } };
export const codexToken = `test.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.test`;

const completion = {
  type: "response.completed",
  response: {
    id: "response-test",
    status: "completed",
    output: [],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  },
};

export function codexBody(body: RequestInit["body"] | undefined): Record<string, unknown> {
  if (body instanceof Uint8Array) {
    body = zstdDecompressSync(body).toString("utf8");
  }
  if (typeof body !== "string") {
    throw new Error("Expected a JSON or compressed Codex body");
  }
  return JSON.parse(body) as Record<string, unknown>;
}

export function codexResponse(): Response {
  return new Response(`data: ${JSON.stringify(completion)}\n\n`, {
    headers: { "content-type": "text/event-stream" },
  });
}

export function mockWebSockets() {
  const sockets: Socket[] = [];
  class Socket extends EventTarget {
    readyState = 0;
    readonly headers: Headers;
    readonly url: string;
    readonly messages: Record<string, unknown>[] = [];

    constructor(url: string, options: { headers: Record<string, string> }) {
      super();
      this.url = url;
      this.headers = new Headers(options.headers);
      sockets.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }

    send(data: string): void {
      this.messages.push(JSON.parse(data) as Record<string, unknown>);
      queueMicrotask(() => {
        this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(completion) }));
      });
    }

    close(): void {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  }
  return { Socket, sockets };
}
