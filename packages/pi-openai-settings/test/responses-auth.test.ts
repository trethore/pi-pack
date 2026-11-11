import assert from "node:assert/strict";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { afterEach, expect, test, vi } from "vitest";
import { model, setup } from "#openai-settings-test/fixtures";
import { completion, searchTurn } from "#openai-settings-test/response-fixtures";

afterEach(() => vi.unstubAllEnvs());

test.each([
	{ name: "API key", credential: { type: "api_key", key: "sk-proj-test" } },
	{
		name: "ChatGPT subscription",
		credential: {
			type: "oauth",
			access: "chatgpt-test-access-token",
			refresh: "test-refresh-token",
			expires: Number.MAX_SAFE_INTEGER,
		},
	},
] as const)("captures and replays normal OpenAI with $name authentication", async ({ credential }) => {
	// Arrange
	const selected = { ...model(), baseUrl: "https://api.openai.com/v1" };
	const harness = setup('{"webSearch":{"value":true}}', selected);
	const runtime = await ModelRuntime.create({
		modelsPath: null,
		allowModelNetwork: false,
		refreshOnCreate: false,
		credentials: {
			read: async (provider) => (provider === "openai" ? credential : undefined),
			list: async () => [{ providerId: "openai", type: credential.type }],
			modify: async (_provider, fn) => fn(credential),
			delete: async () => undefined,
		},
	});
	const turn = searchTurn();
	const events = [
		{ type: "response.created", response: { id: turn.assistant.responseId } },
		...turn.output.map((item, output_index) => ({ type: "response.output_item.done", output_index, item })),
		completion(turn).data,
	];
	const body = events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join("");
	const fetch = vi.fn<typeof globalThis.fetch>(
		async () =>
			new Response(body, {
				headers: { "content-type": "text/event-stream" },
			}),
	);
	const payloads: unknown[] = [];
	const options: NonNullable<Parameters<typeof runtime.streamSimple>[2]> = {
		fetch,
		maxRetries: 0,
		onPayload: async (payload) => {
			await harness.emit({ type: Events.BeforeProviderRequest, payload });
			payloads.push(structuredClone(payload));
		},
		onProviderStreamEvent: async (data, requestModel) => {
			await harness.emit({
				type: Events.ProviderStreamEvent,
				provider: requestModel.provider,
				api: requestModel.api,
				model: requestModel.id,
				data,
			});
		},
	};
	const user = { role: "user" as const, content: "Search.", timestamp: 0 };
	const result = {
		role: "toolResult" as const,
		toolCallId: `${turn.call.call_id}|${turn.call.id}`,
		toolName: turn.call.name,
		content: [{ type: "text" as const, text: "File contents." }],
		isError: false,
		timestamp: 2,
	};

	// Act
	const assistant = await runtime.streamSimple(selected, { messages: [user] }, options).result();
	await harness.emit({ type: Events.MessageEnd, message: assistant });
	harness.sessionManager.appendMessage(assistant);
	harness.sessionManager.appendMessage(result);
	const next = await runtime.streamSimple(selected, { messages: [user, assistant, result] }, options).result();

	// Assert
	expect(await runtime.checkAuth("openai")).toMatchObject({ type: credential.type });
	expect(assistant).toMatchObject({ provider: "openai", api: "openai-responses", stopReason: "toolUse" });
	expect(next.stopReason).toBe("toolUse");
	expect(payloads[1]).toMatchObject({
		model: selected.id,
		tools: [{ type: "web_search" }],
		input: [
			{ role: "user", content: [{ type: "input_text", text: "Search." }] },
			...turn.output,
			{ type: "function_call_output", call_id: turn.call.call_id, output: "File contents." },
		],
	});
	expect(harness.sessionManager.getEntries()[0]).toMatchObject({
		data: { provider: "openai", api: "openai-responses", model: selected.id },
	});
	expect(fetch).toHaveBeenCalledTimes(2);
	const request = fetch.mock.calls[0];
	assert(request);
	expect(new Headers(request[1]?.headers).get("authorization")).toBe(
		`Bearer ${credential.type === "api_key" ? credential.key : credential.access}`,
	);
});
