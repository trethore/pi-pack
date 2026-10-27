import { Events } from "@pi-pack/events";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir, type ExtensionAPI, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import { afterEach, expect, test, vi } from "vitest";
import { loadConfig } from "#whimsical/config.ts";
import whimsical from "#whimsical/index.ts";
import { messages } from "#whimsical/messages.ts";

let directoryNumber = 0;
function configDirectory(): string {
	const directory = join(process.env.HOME ?? "", `whimsical-${directoryNumber++}`);
	mkdirSync(directory, { recursive: true });
	vi.stubEnv("PI_CODING_AGENT_DIR", directory);
	return directory;
}

function setup(source?: string, hasUI = true) {
	const directory = configDirectory();
	if (source !== undefined) {
		writeFileSync(join(directory, "pi-whimsical.jsonc"), source);
	}
	const handlers = new Map<string, (event: unknown, ctx: ExtensionContext) => void>();
	const on = vi.fn<(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) => void>(
		(event: string, handler: (event: unknown, ctx: ExtensionContext) => void) => {
			handlers.set(event, handler);
		},
	);
	const setWorkingMessage = vi.fn<ExtensionContext["ui"]["setWorkingMessage"]>();
	const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
	// Only the API and context surfaces used by this extension are mocked.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const api = { on } as unknown as ExtensionAPI;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const context = { hasUI, ui: { setWorkingMessage, notify } } as unknown as ExtensionContext;
	whimsical(api);
	function emit(event: string): void {
		const handler = handlers.get(event);
		if (!handler) {
			throw new Error(`Missing handler: ${event}`);
		}
		handler({ type: event }, context);
	}
	return { emit, setWorkingMessage, notify };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
});

test("uses 295 built-in messages without configuration", () => {
	// Arrange
	const { emit, setWorkingMessage } = setup();
	vi.spyOn(Math, "random").mockReturnValue(0);

	// Act
	emit(Events.SessionStart);
	emit(Events.TurnStart);

	// Assert
	expect(messages).toHaveLength(295);
	expect(new Set(messages).size).toBe(295);
	expect(setWorkingMessage).toHaveBeenCalledExactlyOnceWith("Schlepping...");
});

test("selects custom JSONC messages each turn and allows repeats", () => {
	// Arrange
	const { emit, setWorkingMessage } = setup('{ // custom\n "messages": ["One", "Two",], }');
	vi.spyOn(Math, "random").mockReturnValueOnce(0).mockReturnValue(0.999);

	// Act
	emit(Events.SessionStart);
	for (let turn = 0; turn < 3; turn++) {
		emit(Events.TurnStart);
		emit(Events.TurnEnd);
	}

	// Assert
	expect(setWorkingMessage.mock.calls).toEqual([["One"], [], ["Two"], [], ["Two"], []]);
});

test.each([Events.TurnEnd, Events.SessionShutdown])("resets the working message on %s", (event) => {
	// Arrange
	const { emit, setWorkingMessage } = setup();
	emit(Events.SessionStart);
	emit(Events.TurnStart);
	setWorkingMessage.mockClear();

	// Act
	emit(event);

	// Assert
	expect(setWorkingMessage).toHaveBeenCalledExactlyOnceWith();
});

test.each([
	{ source: '{"enabled": false}', hasUI: true },
	{ source: undefined, hasUI: false },
])("does not touch the UI when disabled or unavailable: %j", ({ source, hasUI }) => {
	// Arrange
	const { emit, setWorkingMessage, notify } = setup(source, hasUI);

	// Act
	for (const event of [Events.SessionStart, Events.TurnStart, Events.TurnEnd, Events.SessionShutdown]) {
		emit(event);
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

test.each(["{", "null", "[]", '{"enabled": "yes"}', '{"messages": [42]}', '{"messages": null}'])(
	"warns and uses defaults for invalid config: %s",
	(source) => {
		// Arrange
		const { emit, setWorkingMessage, notify } = setup(source);
		vi.spyOn(Math, "random").mockReturnValue(0);

		// Act
		emit(Events.SessionStart);
		emit(Events.TurnStart);

		// Assert
		expect(notify).toHaveBeenCalledExactlyOnceWith(expect.stringContaining("Using defaults"), "warning");
		expect(setWorkingMessage).toHaveBeenCalledExactlyOnceWith(messages[0]);
	},
);

test("uses Pi's default agent directory when no override is set", () => {
	// Arrange
	vi.stubEnv("PI_CODING_AGENT_DIR", undefined);

	// Act
	const directory = getAgentDir();

	// Assert
	expect(directory).toBe(join(process.env.HOME ?? "", ".pi", "agent"));
});
