import { createExtensionHarness } from "#test/extension-harness.ts";
import { Events } from "@pi-pack/events";
import { join } from "node:path";
import { getAgentDir, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig } from "#whimsical/config.ts";
import whimsical from "#whimsical/index.ts";
import { messages } from "#whimsical/messages.ts";

function setup(source?: string, hasUI = true) {
	const setWorkingMessage = vi.fn<ExtensionContext["ui"]["setWorkingMessage"]>();
	const harness = createExtensionHarness(whimsical, "pi-whimsical.jsonc", { hasUI, ui: { setWorkingMessage } });
	if (source !== undefined) {
		harness.writeConfig(source);
	}
	return { ...harness, setWorkingMessage };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

test("uses 295 built-in messages without configuration", async () => {
	// Arrange
	const { emit, setWorkingMessage } = setup();
	vi.spyOn(Math, "random").mockReturnValue(0);

	// Act
	await emit(Events.SessionStart);
	await emit(Events.TurnStart);

	// Assert
	expect(messages).toHaveLength(295);
	expect(new Set(messages).size).toBe(295);
	expect(setWorkingMessage).toHaveBeenCalledExactlyOnceWith("Schlepping...");
});

test("selects custom JSONC messages each turn and allows repeats", async () => {
	// Arrange
	const { emit, setWorkingMessage } = setup('{ // custom\n "messages": ["One", "Two",], }');
	vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValue(0.999);

	// Act
	await emit(Events.SessionStart);
	for (let turn = 0; turn < 3; turn++) {
		await emit(Events.TurnStart);
		await emit(Events.TurnEnd);
	}

	// Assert
	expect(setWorkingMessage.mock.calls).toEqual([["One"], [], ["Two"], [], ["Two"], []]);
});

test.each([Events.TurnEnd, Events.SessionShutdown])("resets the working message on %s", async (event) => {
	// Arrange
	const { emit, setWorkingMessage } = setup();
	await emit(Events.SessionStart);
	await emit(Events.TurnStart);
	setWorkingMessage.mockClear();

	// Act
	await emit(event);

	// Assert
	expect(setWorkingMessage).toHaveBeenCalledExactlyOnceWith();
});

test.each([
	{ source: '{"enabled": false}', hasUI: true },
	{ source: undefined, hasUI: false },
])("does not touch the UI when disabled or unavailable: %j", async ({ source, hasUI }) => {
	// Arrange
	const { emit, setWorkingMessage, notify } = setup(source, hasUI);

	// Act
	for (const event of [Events.SessionStart, Events.TurnStart, Events.TurnEnd, Events.SessionShutdown]) {
		await emit(event);
	}

	// Assert
	expect(setWorkingMessage).not.toHaveBeenCalled();
	expect(notify).not.toHaveBeenCalled();
});

test.each(["{}", '{"messages": []}'])("falls back to built-ins for %s", (source) => {
	// Arrange
	setup(source);

	// Act
	const config = loadConfig();

	// Assert
	expect(config).toEqual({ enabled: true, messages });
});

test.each([
	"{",
	"null",
	"[]",
	'{"enabled": "yes"}',
	'{"messages": [42]}',
	'{"messages": null}',
	'{"enable": false}',
	'{"enabled": false, "messages": 42}',
])("reports an error and stays inactive for invalid config: %s", async (source) => {
	// Arrange
	const { emit, setWorkingMessage, notify } = setup(source);
	vi.spyOn(Math, "random").mockReturnValue(0);

	// Act
	await emit(Events.SessionStart);
	await emit(Events.TurnStart);

	// Assert
	expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Extension inactive"), "error");
	expect(setWorkingMessage).not.toHaveBeenCalled();
});

test("uses Pi's default agent directory when no override is set", () => {
	// Arrange
	vi.stubEnv("PI_CODING_AGENT_DIR", undefined);

	// Act
	const directory = getAgentDir();

	// Assert
	expect(directory).toBe(join(process.env.HOME ?? "", ".pi", "agent"));
});

test("clears active config on failure and recovers after a successful reload", async () => {
	// Arrange
	const { emit, setWorkingMessage, notify, writeConfig } = setup('{"messages": ["Custom"]}');
	await emit(Events.SessionStart);
	await emit(Events.TurnStart);
	setWorkingMessage.mockClear();
	writeConfig('{"enable": false}');

	// Act
	await emit(Events.SessionStart);
	await emit(Events.TurnStart);
	await emit(Events.TurnEnd);
	const callsAfterFailure = [...setWorkingMessage.mock.calls];
	writeConfig('{"messages": ["Recovered"]}');
	await emit(Events.SessionStart);
	await emit(Events.TurnStart);

	// Assert
	expect(callsAfterFailure).toEqual([[]]);
	expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("enable"), "error");
	expect(setWorkingMessage).toHaveBeenLastCalledWith("Recovered");
});
