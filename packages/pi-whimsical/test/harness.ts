import whimsical from "#src/index";
import {
	type ExtensionAPI,
	type ExtensionContext,
	type ExtensionHandler,
	type TurnStartEvent,
} from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { vi } from "vitest";

const on = vi.fn<(event: string, handler: ExtensionHandler<TurnStartEvent>) => () => void>();
const setWorkingMessage = vi.fn<ExtensionContext["ui"]["setWorkingMessage"]>();
const turn: TurnStartEvent = { type: Events.TurnStart, turnIndex: 0, timestamp: 0 };

const Harness = {
	load(this: void): void {
		// Only event registration is used by this extension factory.
		// eslint-disable-next-line typescript/no-unsafe-type-assertion
		whimsical({ on } as unknown as ExtensionAPI);
	},
	async turn(hasUI = true): Promise<void> {
		const [registration] = on.mock.calls;
		if (registration === undefined) {
			throw new Error("Expected a turn_start handler.");
		}
		const [, handler] = registration;
		// Only UI availability and the working-message setter are used by the handler.
		// eslint-disable-next-line typescript/no-unsafe-type-assertion
		const ctx = { hasUI, ui: { setWorkingMessage } } as unknown as ExtensionContext;
		await handler(turn, ctx);
	},
};

export { Harness, on, setWorkingMessage };
