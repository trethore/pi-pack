import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	ExtensionEvent,
	RegisteredCommand,
	Theme,
} from "@earendil-works/pi-coding-agent";
import { vi } from "vitest";

type MockUI = Partial<Omit<ExtensionContext["ui"], "theme">> & { theme?: Partial<Theme> };
type MockContext = {
	hasUI?: boolean;
	model?: ExtensionContext["model"];
	ui?: MockUI;
	modelRegistry?: Partial<ExtensionContext["modelRegistry"]>;
};
type Handler = (event: ExtensionEvent | { type: ExtensionEvent["type"] }, ctx: ExtensionContext) => unknown;

/** Minimal event/config harness. Callers provide only the context surfaces their extension uses. */
export function createExtensionHarness(
	extension: (pi: ExtensionAPI) => void,
	configFilename: string,
	context: MockContext = {},
	initialConfig?: string,
) {
	const directory = mkdtempSync(join(process.env.HOME ?? "", "extension-"));
	vi.stubEnv("PI_CODING_AGENT_DIR", directory);
	if (initialConfig !== undefined) {
		writeFileSync(join(directory, configFilename), initialConfig);
	}
	const commands = new Map<string, Omit<RegisteredCommand, "name" | "sourceInfo">>();
	const handlers = new Map<ExtensionEvent["type"], Handler[]>();
	const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
	// These intentionally partial mocks fail when an extension uses an unprovided API surface.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const ctx = { hasUI: true, ...context, ui: { notify, ...context.ui } } as ExtensionCommandContext;
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const api = {
		registerCommand(name: string, command: Omit<RegisteredCommand, "name" | "sourceInfo">) {
			commands.set(name, command);
		},
		on(type: ExtensionEvent["type"], handler: Handler) {
			const subscriptions = handlers.get(type) ?? [];
			subscriptions.push(handler);
			handlers.set(type, subscriptions);
		},
	} as ExtensionAPI;
	extension(api);

	function writeConfig(source: string): void {
		writeFileSync(join(directory, configFilename), source);
	}

	// A name alone is convenient for lifecycle handlers that do not inspect their payload.
	// Supply the full typed event when testing payload-dependent behavior.
	async function emit(event: ExtensionEvent | ExtensionEvent["type"]): Promise<void> {
		const payload = typeof event === "string" ? { type: event } : event;
		const subscriptions = handlers.get(payload.type);
		if (!subscriptions) {
			throw new Error(`Missing handler: ${payload.type}`);
		}
		for (const handler of subscriptions) {
			await handler(payload, ctx);
		}
	}

	async function runCommand(name: string, args: string): Promise<void> {
		const command = commands.get(name);
		if (!command) {
			throw new Error(`Missing command: ${name}`);
		}
		await command.handler(args, ctx);
	}

	return { emit, writeConfig, notify, commands, runCommand };
}
