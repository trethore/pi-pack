import openAISettings from "#src/index";
import { Fixtures } from "#test/fixtures";
import {
	type BeforeProviderRequestEvent,
	type ExtensionAPI,
	type ExtensionCommandContext,
	type ExtensionContext,
	type ExtensionHandler,
} from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { vi } from "vitest";

const Harness = {
	create() {
		const on = vi.fn<(event: string, handler: ExtensionHandler<BeforeProviderRequestEvent, unknown>) => () => void>();
		const registerCommand = vi.fn<ExtensionAPI["registerCommand"]>();
		const notify = vi.fn<ExtensionContext["ui"]["notify"]>();
		// The extension uses request registration, command registration, the current model, and notifications.
		// eslint-disable-next-line typescript/no-unsafe-type-assertion
		openAISettings({ on, registerCommand } as unknown as ExtensionAPI);
		return {
			on,
			registerCommand,
			notify,
			async request(
				payload: unknown,
				model: { provider: string; api: string } | undefined = Fixtures.model,
			): Promise<unknown> {
				const [, handler] = on.mock.calls.find(([event]) => event === Events.BeforeProviderRequest) ?? [];
				// eslint-disable-next-line typescript/no-unsafe-type-assertion
				const ctx = { model } as unknown as ExtensionContext;
				return handler?.({ type: Events.BeforeProviderRequest, payload }, ctx);
			},
			async command(args: string): Promise<void> {
				const [, command] = registerCommand.mock.calls.find(([name]) => name === "openai-settings") ?? [];
				if (command === undefined) {
					throw new Error("Expected openai-settings to be registered.");
				}
				// eslint-disable-next-line typescript/no-unsafe-type-assertion
				const ctx = { ui: { notify } } as unknown as ExtensionCommandContext;
				await command.handler(args, ctx);
			},
		};
	},
};

export { Harness };
