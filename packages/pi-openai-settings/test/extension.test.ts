import { OpenAISettingsConfig } from "#src/config";
import { StreamEvent } from "#src/search-history";
import { Fixtures } from "#test/fixtures";
import { Harness } from "#test/harness";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock(import("#src/config"), async (importOriginal) => {
	const original = await importOriginal();
	return {
		...original,
		OpenAISettingsConfig: {
			...original.OpenAISettingsConfig,
			read: vi.fn<typeof OpenAISettingsConfig.read>(),
			save: vi.fn<typeof OpenAISettingsConfig.save>(),
		},
	};
});

beforeEach(() => {
	vi.mocked(OpenAISettingsConfig.read).mockResolvedValue(OpenAISettingsConfig.defaults());
});

afterEach(() => {
	vi.resetAllMocks();
});

test("registers the request hook and command even when initially disabled", async () => {
	expect.hasAssertions();
	// Arrange
	const config = { ...OpenAISettingsConfig.defaults(), enabled: false };
	vi.mocked(OpenAISettingsConfig.read).mockResolvedValue(config);

	// Act
	const harness = await Harness.create();
	const result = await harness.request({});
	await harness.command("enabled true");

	// Assert
	expect(harness.on).toHaveBeenCalledWith(Events.BeforeProviderRequest, expect.any(Function));
	expect(harness.registerCommand).toHaveBeenCalledExactlyOnceWith(
		"openai-settings",
		expect.any(Object),
	);
	expect(result).toBeUndefined();
	await expect(harness.request({})).resolves.toStrictEqual({});
});

test.each([
	Fixtures.model,
	{ provider: "azure", api: "azure-openai-responses" },
	{ provider: "github-copilot", api: "openai-responses" },
])("applies command changes to subsequent requests for $provider", async (model) => {
	expect.hasAssertions();
	// Arrange
	const config = OpenAISettingsConfig.defaults();
	config.verbosity.command = true;
	vi.mocked(OpenAISettingsConfig.read).mockResolvedValue(config);
	const harness = await Harness.create();

	// Act
	await harness.command("verbosity high");
	const result = await harness.request({ model: "test", text: { format: { type: "text" } } }, model);
	await harness.command("verbosity null");

	// Assert
	expect(result).toStrictEqual({ model: "test", text: { format: { type: "text" }, verbosity: "high" } });
	await expect(harness.request({}, model)).resolves.toStrictEqual({});
});

test("uses the current model on every request", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();

	// Act
	const supported = await harness.request({});
	const unsupported = await harness.request({}, { provider: "openai", api: "openai-completions" });

	// Assert
	expect(supported).toStrictEqual({});
	expect(unsupported).toBeUndefined();
});

test("reports command errors without throwing or modifying settings", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();

	// Act
	await harness.command("webSearch true");

	// Assert
	expect(harness.notify).toHaveBeenCalledExactlyOnceWith(
		"Error: The webSearch command is disabled in the global config.",
		"error",
	);
	await expect(harness.request({})).resolves.toStrictEqual({});
});

test("shows settings with no arguments", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();

	// Act
	await harness.command("");

	// Assert
	expect(harness.notify).toHaveBeenCalledWith(expect.stringContaining("enabled = true"), "info");
});

test("registers argument completions for setting names and values", async () => {
	expect.hasAssertions();
	// Arrange
	vi.mocked(OpenAISettingsConfig.read).mockResolvedValue(await Fixtures.config());
	const harness = await Harness.create();
	const [registration] = harness.registerCommand.mock.calls;
	const [, command] = registration ?? [];

	// Act
	const names = command?.getArgumentCompletions?.("ver");
	const values = command?.getArgumentCompletions?.("verbosity h");

	// Assert
	expect(names).toStrictEqual([{ value: "verbosity ", label: "verbosity" }]);
	expect(values).toStrictEqual([{ value: "verbosity high", label: "high" }]);
});

const first = { id: "rs_a", type: "reasoning" };
const last = { id: "rs_b", type: "reasoning" };
const search = {
	id: "ws_1",
	type: "web_search_call",
	status: "completed",
	action: { type: "search", query: "weather" },
};
const output = [first, search, last, { ...search, id: "ws_2" }];
const completed = { type: StreamEvent.Completed, response: { output } };

async function resumeWithoutCapture() {
	const harness = await Harness.create();
	await harness.stream(completed);
	const config = OpenAISettingsConfig.defaults();
	config.webSearch = { ...config.webSearch, preserveCalls: false, value: false };
	vi.mocked(OpenAISettingsConfig.read).mockResolvedValue(config);
	const header = harness.sessionManager.getHeader();
	if (!header) {
		throw new Error("Missing session header");
	}
	const entries = structuredClone([header, ...harness.sessionManager.getEntries()]);
	return Harness.create(SessionManager.inMemory(undefined, undefined, entries));
}

test("restores search calls once in output order after reloading with capture and search disabled", async () => {
	expect.hasAssertions();
	// Arrange
	const resumed = await resumeWithoutCapture();
	const prior = resumed.sessionManager.getBranch();

	// Act
	await resumed.stream(completed);
	const result = await resumed.request({ input: [first, last] });

	// Assert
	expect(resumed.sessionManager.getBranch()).toStrictEqual(prior);
	expect(result).toStrictEqual({ input: output });
	await expect(resumed.request(result)).resolves.toStrictEqual(result);
});

test("does not restore calls whose response is absent from input", async () => {
	expect.hasAssertions();
	// Arrange
	const resumed = await resumeWithoutCapture();
	const payload = { input: ["unrelated"] };

	// Act
	const result = await resumed.request(payload);

	// Assert
	expect(result).toStrictEqual(payload);
});

test.each([
	{ type: "response.output_item.added" },
	{ type: StreamEvent.Completed },
	{ type: StreamEvent.Completed, response: { output: [{ type: "unknown" }, { type: "message", id: "msg_1" }] } },
])("does not save non-search events", async (event) => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();

	// Act
	await harness.stream(event);

	// Assert
	expect(harness.sessionManager.getEntries()).toStrictEqual([]);
});

const emptyTerminal = { type: StreamEvent.Completed, response: { output: [] } };

async function streamItems(harness: Awaited<ReturnType<typeof Harness.create>>) {
	await harness.stream({ type: StreamEvent.Created });
	for (const [index, item] of [...output.entries()].toReversed()) {
		// Stream events arrive sequentially, even when output items finish out of order.
		// eslint-disable-next-line no-await-in-loop
		await harness.stream({ type: StreamEvent.ItemDone, output_index: index, item });
	}
}

test("replays streamed items by output index when terminal output is empty", async () => {
	expect.hasAssertions();
	// Arrange
	const harness = await Harness.create();
	await streamItems(harness);

	// Act
	await harness.stream(emptyTerminal);
	const replay = await harness.request({ input: [first, last] });

	// Assert
	expect(replay).toStrictEqual({ input: output });
});

test.each([StreamEvent.Failed, StreamEvent.Incomplete, StreamEvent.Error, StreamEvent.Created])(
	"discards unfinished search calls on %s",
	async (type) => {
		expect.hasAssertions();
		// Arrange
		const harness = await Harness.create();
		await streamItems(harness);

		// Act
		await harness.stream({ type });
		await harness.stream(emptyTerminal);

		// Assert
		expect(harness.sessionManager.getEntries()).toStrictEqual([]);
	},
);
