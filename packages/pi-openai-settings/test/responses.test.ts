import assert from "node:assert/strict";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { afterEach, expect, test, vi } from "vitest";
import { model, setup } from "#openai-settings-test/fixtures";
import { completion, finishTurn, searchTurn } from "#openai-settings-test/response-fixtures";

afterEach(() => vi.unstubAllEnvs());

const supportedModels = [
	["openai", "openai-responses"],
	["azure", "azure-openai-responses"],
	["github-copilot", "openai-responses"],
] as const;

test.each(supportedModels)("captures and restores native %s/%s output by default", async (provider, api) => {
	// Arrange
	const harness = setup(undefined, model(provider, api));
	const turn = searchTurn();
	turn.assistant.provider = provider;
	turn.assistant.api = api;
	const user = { role: "user", content: "Search, then read the file." };
	const result = { type: "function_call_output", call_id: turn.call.call_id, output: "File contents." };
	await finishTurn(harness, turn);
	const payload = { model: "test-model", prompt_cache_key: "stable", input: [user, ...turn.input, result] };
	const originalOutput = structuredClone(turn.output);

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual([user, ...turn.output, result]);
	expect(payload.input[0]).toBe(user);
	expect(payload.input.at(-1)).toBe(result);
	expect(payload.prompt_cache_key).toBe("stable");
	expect(turn.output).toEqual(originalOutput);
	expect(harness.sessionManager.buildSessionProjection().messages).toEqual([turn.assistant]);
	expect(harness.sessionManager.getBranch().map((entry) => entry.type)).toEqual(["custom", "message"]);
	expect(harness.sessionManager.getEntries()[0]).toMatchObject({
		data: { version: 1, provider, api, model: "test-model", output: originalOutput },
	});
});

test("restores multiple responses in place and remains idempotent", async () => {
	// Arrange
	const harness = setup();
	const first = searchTurn("first");
	const second = searchTurn("second");
	await finishTurn(harness, first);
	await finishTurn(harness, second);
	const user = { role: "user", content: "Search again." };
	const payload = { model: "test-model", input: [...first.input, user, ...second.input] };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual([...first.output, user, ...second.output]);
});

test("captures all searches within a response in their original positions", async () => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	const openPage = { ...turn.search, id: "ws_open", action: { type: "open_page", url: "https://example.invalid" } };
	turn.output.splice(3, 0, openPage);
	await finishTurn(harness, turn);
	const payload = { model: "test-model", input: turn.input };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual(turn.output);
});

test.each(['{"enabled":false}', '{"webSearch":{"captureResponses":false}}'])(
	"does not capture or replay when disabled: %s",
	async (source) => {
		// Arrange
		const turn = searchTurn();
		const initial = setup();
		await finishTurn(initial, turn);
		const harness = setup(source, model(), initial.sessionManager);
		const payload = { model: "test-model", input: turn.input };
		const entries = harness.sessionManager.getEntries().length;

		// Act
		await finishTurn(harness, searchTurn("disabled"));
		await harness.emit({ type: Events.BeforeProviderRequest, payload });

		// Assert
		expect(payload.input).toBe(turn.input);
		expect(harness.sessionManager.getEntries()).toHaveLength(entries + 1);
	},
);

test("disabling the web-search tool does not disable replay of earlier search responses", async () => {
	// Arrange
	const harness = setup('{"webSearch":{"value":true,"command":true}}');
	const turn = searchTurn();
	await finishTurn(harness, turn);
	const payload = { model: "test-model", tools: [{ type: "web_search" }], input: turn.input };

	// Act
	await harness.runCommand("openai-settings", "webSearch false");
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.tools).toEqual([]);
	expect(payload.input).toEqual(turn.output);
});

test.each(supportedModels)("replays persisted %s/%s captures after reload", async (provider, api) => {
	// Arrange
	const first = setup(undefined, model(provider, api));
	const turn = searchTurn();
	turn.assistant.provider = provider;
	turn.assistant.api = api;
	await finishTurn(first, turn);
	const reloaded = setup(
		undefined,
		model(provider, api),
		SessionManager.inMemory(undefined, undefined, [...structuredClone(first.sessionManager.getEntries())]),
	);
	const payload = { model: "test-model", input: turn.input };

	// Act
	await reloaded.emit(Events.SessionStart);
	await reloaded.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual(turn.output);
});

test("uses only the active branch, including captures preceding a forked assistant", async () => {
	// Arrange
	const harness = setup();
	const first = searchTurn("first");
	const second = searchTurn("abandoned");
	const forkPoint = await finishTurn(harness, first);
	await finishTurn(harness, second);
	harness.sessionManager.branch(forkPoint);
	const payload = { model: "test-model", input: [...first.input, ...second.input] };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual([...first.output, ...second.input]);
});

test("does not resurrect compacted responses even if their IDs appear in a separate request", async () => {
	// Arrange
	const harness = setup();
	const old = searchTurn("old");
	const kept = searchTurn("kept");
	await finishTurn(harness, old);
	const firstKeptEntry = await finishTurn(harness, kept);
	harness.sessionManager.appendCompaction("Summary", firstKeptEntry, 100000);
	const payload = { model: "test-model", input: [...old.input, ...kept.input] };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual([...old.input, ...kept.output]);
});

test.each([null, { content: [{ type: "text" as const, text: "Redacted." }] }])(
	"respects persistent context edits and omissions: %j",
	async (replacement) => {
		// Arrange
		const harness = setup();
		const turn = searchTurn();
		const target = await finishTurn(harness, turn);
		harness.sessionManager.appendContextEdit(target, replacement);
		const payload = { model: "test-model", input: turn.input };

		// Act
		await harness.emit({ type: Events.BeforeProviderRequest, payload });

		// Assert
		expect(payload.input).toBe(turn.input);
	},
);

test.each([
	"text",
	"arguments",
	"reasoning",
	"extra field",
	"missing anchor",
	"duplicate anchor",
	"interleaved item",
	"partial restoration",
])("leaves changed or ambiguous outgoing spans untouched: %s", async (change) => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	await finishTurn(harness, turn);
	const input = structuredClone(turn.input);
	switch (change) {
		case "text":
			input[1] = { ...input[1], content: [{ type: "output_text", text: "Edited", annotations: [] }] };
			break;
		case "arguments":
			input[2] = { ...input[2], arguments: '{"path":"different.txt"}' };
			break;
		case "reasoning":
			input[0] = { ...input[0], encrypted_content: "different" };
			break;
		case "extra field":
			input[1] = { ...input[1], custom_field: true };
			break;
		case "missing anchor":
			input.pop();
			break;
		case "duplicate anchor":
			input.push({ ...turn.reasoning });
			break;
		case "interleaved item":
			input.splice(1, 0, { role: "user", content: "New instruction" });
			break;
		case "partial restoration":
			input.splice(1, 0, { ...turn.search });
			break;
	}
	const payload = { model: "test-model", input };
	const original = structuredClone(payload);

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload).toEqual(original);
	expect(payload.input).toBe(input);
});

test("correlates interleaved warm responses by response ID and persists only the assistant's response", async () => {
	// Arrange
	const harness = setup();
	const real = searchTurn("real");
	const warm = searchTurn("warm");
	await harness.emit(completion(real));
	await harness.emit(completion(warm));

	// Act
	await harness.emit({ type: Events.MessageEnd, message: real.assistant });
	harness.sessionManager.appendMessage(real.assistant);
	const payload = { model: "test-model", input: real.input };
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual(real.output);
	const captures = harness.sessionManager.getEntries().filter((entry) => entry.type === "custom");
	expect(captures).toHaveLength(1);
	expect(captures[0]?.data).toMatchObject({ responseId: real.assistant.responseId });
});

test.each(["error", "aborted", "length"] as const)("does not persist %s assistant responses", async (stopReason) => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	turn.assistant.stopReason = stopReason;

	// Act
	await finishTurn(harness, turn);

	// Assert
	expect(harness.sessionManager.getEntries().map((entry) => entry.type)).toEqual(["message"]);
});

test.each([Events.SessionStart, Events.SessionShutdown, Events.AgentSettled])(
	"clears pending captures on %s",
	async (event) => {
		// Arrange
		const harness = setup();
		const turn = searchTurn();
		await harness.emit(completion(turn));

		// Act
		await harness.emit(event);
		await harness.emit({ type: Events.MessageEnd, message: turn.assistant });

		// Assert
		expect(harness.sessionManager.getEntries()).toEqual([]);
	},
);

test.each([
	["openai-codex", "openai-codex-responses"],
	["openai-codex", "openai-responses"],
	["openai", "openai-codex-responses"],
	["openai", "openai-completions"],
	["azure", "openai-responses"],
	["github-copilot", "azure-openai-responses"],
	["openrouter", "openai-responses"],
])("does not capture %s/%s responses", async (provider, api) => {
	// Arrange
	const harness = setup(undefined, model(provider, api));
	const turn = searchTurn();
	turn.assistant.provider = provider;
	turn.assistant.api = api;

	// Act
	await finishTurn(harness, turn);

	// Assert
	expect(harness.sessionManager.getEntries().map((entry) => entry.type)).toEqual(["message"]);
});

test.each(supportedModels)(
	"isolates interleaved %s/%s captures from other providers with matching IDs",
	async (provider, api) => {
		// Arrange
		const selected = model(provider, api);
		const harness = setup(undefined, selected);
		const turns = [];
		for (const [sourceProvider, sourceApi] of supportedModels) {
			const turn = searchTurn();
			turn.assistant.provider = sourceProvider;
			turn.assistant.api = sourceApi;
			turn.search.action.queries = [sourceProvider];
			await harness.emit(completion(turn));
			turns.push(turn);
		}
		const retained = turns.find((turn) => turn.assistant.provider === provider);
		assert(retained);
		const payload = { model: "test-model", input: retained.input };

		// Act
		for (const turn of turns) {
			await harness.emit({ type: Events.MessageEnd, message: turn.assistant });
			harness.sessionManager.appendMessage(turn.assistant);
		}
		await harness.emit({ type: Events.BeforeProviderRequest, payload });

		// Assert
		expect(harness.sessionManager.getEntries().filter((entry) => entry.type === "custom")).toHaveLength(turns.length);
		expect(payload.input).toEqual(retained.output);
	},
);

test.each(supportedModels)("does not replay %s/%s captures on a different model or API", async (provider, api) => {
	// Arrange
	const selected = model(provider, api);
	const harness = setup(undefined, selected);
	const turn = searchTurn();
	turn.assistant.provider = provider;
	turn.assistant.api = api;
	await finishTurn(harness, turn);
	const differentModel = { model: "another-model", input: turn.input };
	const differentApi = { model: "test-model", input: turn.input };

	// Act
	selected.id = "another-model";
	await harness.emit({ type: Events.BeforeProviderRequest, payload: differentModel });
	selected.id = "test-model";
	selected.api = "openai-completions";
	await harness.emit({ type: Events.BeforeProviderRequest, payload: differentApi });

	// Assert
	expect(differentModel.input).toBe(turn.input);
	expect(differentApi.input).toBe(turn.input);
});

test("does not replay an OpenAI capture when switching to Copilot", async () => {
	// Arrange
	const selected = model();
	const harness = setup(undefined, selected);
	const turn = searchTurn();
	await finishTurn(harness, turn);
	const payload = { model: "test-model", input: turn.input };

	// Act
	selected.provider = "github-copilot";
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toBe(turn.input);
});

test("restores Azure captures when the request uses a deployment alias", async () => {
	// Arrange
	const harness = setup(undefined, model("azure", "azure-openai-responses"));
	const turn = searchTurn();
	turn.assistant.provider = "azure";
	turn.assistant.api = "azure-openai-responses";
	await finishTurn(harness, turn);
	const payload = { model: "production-deployment", input: turn.input };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.model).toBe("production-deployment");
	expect(payload.input).toEqual(turn.output);
});

test.each([
	null,
	{},
	{ type: "response.completed", response: null },
	{ type: "response.completed", response: { id: "resp_bad", status: "completed", output: [null] } },
])("ignores malformed provider events: %j", async (data) => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();

	// Act
	await harness.emit({ ...completion(turn), data });
	await harness.emit({ type: Events.MessageEnd, message: turn.assistant });

	// Assert
	expect(harness.sessionManager.getEntries()).toEqual([]);
});

test.each(["response.failed", "response.incomplete", "response.output_item.done"])(
	"does not capture %s",
	async (type) => {
		// Arrange
		const harness = setup();
		const turn = searchTurn();

		// Act
		await harness.emit({
			...completion(turn),
			data: { type, response: { id: turn.assistant.responseId, status: "completed", output: turn.output } },
		});
		await harness.emit({ type: Events.MessageEnd, message: turn.assistant });

		// Assert
		expect(harness.sessionManager.getEntries()).toEqual([]);
	},
);

test("ignores malformed persisted records without changing otherwise valid requests", async () => {
	// Arrange
	const harness = setup();
	harness.sessionManager.appendCustomEntry("pi-openai-settings.responses", { version: 1, output: [null] });
	const payload = { model: "test-model", input: [{ role: "user", content: "Hello" }] };
	const original = structuredClone(payload);

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload).toEqual(original);
});

test.each([
	{ input: "text" },
	{ input: [null] },
	{ input: [] },
	{ model: "different-model" },
	{ reasoning: null },
	{ text: [] },
	{ tools: "invalid" },
])("does not change invalid or unrelated payloads: %j", async (fields) => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	await finishTurn(harness, turn);
	const payload = { model: "test-model", input: turn.input, ...fields };
	const original = structuredClone(payload);

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload).toEqual(original);
});

test("uses the SDK to remove output-only provenance while retaining annotations and original arguments", async () => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	turn.output = turn.output.map((item) => ({ ...item, created_by: "provider" }));
	turn.input[0] = { ...turn.reasoning, created_by: "provider" };
	await finishTurn(harness, turn);
	const payload = { model: "test-model", input: turn.input };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual([turn.reasoning, turn.search, turn.text, turn.call]);
});

test("preserves native refusals and custom-tool input without rewriting tool results", async () => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	const refusal = { ...turn.text, phase: null, content: [{ type: "refusal", refusal: "Cannot answer that part." }] };
	const custom = {
		type: "custom_tool_call",
		id: "ctc_custom",
		call_id: "custom_call",
		name: "grammar",
		namespace: "functions",
		input: "original\ninput",
	};
	turn.output = [turn.search, refusal, custom];
	turn.input = [
		{
			...refusal,
			phase: undefined,
			content: [{ type: "output_text", text: "Cannot answer that part.", annotations: [] }],
		},
		{ ...custom },
	];
	await finishTurn(harness, turn);
	const result = { type: "custom_tool_call_output", call_id: "custom_call", output: "Done" };
	const payload = { model: "test-model", input: [...turn.input, result] };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual([...turn.output, result]);
	expect(payload.input.at(-1)).toBe(result);
});

test.each(["no search", "unknown item", "duplicate ID"])(
	"does not capture unsupported responses: %s",
	async (variant) => {
		// Arrange
		const harness = setup();
		const turn = searchTurn();
		if (variant === "no search") {
			turn.output = turn.output.filter((item) => item.type !== "web_search_call");
		} else if (variant === "unknown item") {
			turn.output.push({ type: "future_tool_call", id: "future" });
		} else {
			turn.output.push({ ...turn.search });
		}

		// Act
		await finishTurn(harness, turn);

		// Assert
		expect(harness.sessionManager.getEntries().map((entry) => entry.type)).toEqual(["message"]);
	},
);

test.each([
	"broken JSON",
	"non-object JSON",
	"long message ID",
	"foreign function ID",
	"foreign custom ID",
	"no anchor",
])("skips unsupported projections instead of guessing: %s", async (variant) => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	switch (variant) {
		case "broken JSON":
			turn.call.arguments = "{";
			break;
		case "non-object JSON":
			turn.call.arguments = "null";
			break;
		case "long message ID":
			turn.text.id = "m".repeat(65);
			break;
		case "foreign function ID":
			turn.call.id = "foreign";
			break;
		case "foreign custom ID":
			turn.output.push({ type: "custom_tool_call", id: "foreign", call_id: "c", name: "grammar", input: "x" });
			break;
		case "no anchor":
			turn.output = [turn.search];
			break;
	}
	await finishTurn(harness, turn);
	const payload = { model: "test-model", input: turn.input };

	// Act
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toBe(turn.input);
});

test.each(["provider", "api", "model"] as const)(
	"ignores a completed response with a different assistant %s",
	async (field) => {
		// Arrange
		const harness = setup();
		const turn = searchTurn();
		await harness.emit(completion(turn));
		turn.assistant[field] = "different";

		// Act
		await harness.emit({ type: Events.MessageEnd, message: turn.assistant });

		// Assert
		expect(harness.sessionManager.getEntries()).toEqual([]);
	},
);

test("does not attach a stale capture to a different session", async () => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	await harness.emit(completion(turn));
	harness.sessionManager.newSession();

	// Act
	await harness.emit({ type: Events.MessageEnd, message: turn.assistant });

	// Assert
	expect(harness.sessionManager.getEntries()).toEqual([]);
});

test("takes a snapshot of the native event rather than retaining mutable provider objects", async () => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	const expected = structuredClone(turn.output);
	await harness.emit(completion(turn));
	turn.search.action.queries.push("Changed after capture");

	// Act
	await harness.emit({ type: Events.MessageEnd, message: turn.assistant });
	harness.sessionManager.appendMessage(turn.assistant);
	const payload = { model: "test-model", input: turn.input };
	await harness.emit({ type: Events.BeforeProviderRequest, payload });

	// Assert
	expect(payload.input).toEqual(expected);
});

test("bounds unclaimed captures from background requests", async () => {
	// Arrange
	const harness = setup();
	const old = searchTurn("old");
	await harness.emit(completion(old));

	// Act
	for (let i = 0; i < 12; i++) {
		await harness.emit(completion(searchTurn(`warm-${i}`)));
	}
	await harness.emit({ type: Events.MessageEnd, message: old.assistant });
	const current = searchTurn("current");
	await finishTurn(harness, current);

	// Assert
	const captures = harness.sessionManager.getEntries().filter((entry) => entry.type === "custom");
	expect(captures).toHaveLength(1);
	expect(captures[0]?.data).toMatchObject({ responseId: current.assistant.responseId });
});

test("later payload mutation cannot alter the saved native search metadata", async () => {
	// Arrange
	const harness = setup();
	const turn = searchTurn();
	await finishTurn(harness, turn);
	const first = { model: "test-model", input: turn.input };
	await harness.emit({ type: Events.BeforeProviderRequest, payload: first });
	const search = first.input.find((item) => item.type === "web_search_call");

	// Act
	// Modify an opaque, nested field that the replay schema intentionally does not interpret.
	const action = search?.action;
	assert(action !== null && typeof action === "object" && "queries" in action && Array.isArray(action.queries));
	action.queries.push("Changed by a later extension");
	const next = { model: "test-model", input: turn.input };
	await harness.emit({ type: Events.BeforeProviderRequest, payload: next });

	// Assert
	expect(next.input).toEqual(turn.output);
});
