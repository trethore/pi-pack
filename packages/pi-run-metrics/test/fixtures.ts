import { type AssistantMessage } from "@earendil-works/pi-ai";

const Fixtures = {
	message(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
		return {
			role: "assistant",
			content: [],
			api: "anthropic-messages",
			provider: "anthropic",
			model: "test",
			stopReason: "stop",
			timestamp: 0,
			durationMs: 12_000,
			usage: {
				input: 1200,
				output: 410,
				cacheRead: 800,
				cacheWrite: 200,
				totalTokens: 2610,
				cost: { input: 0.001, output: 0.002, cacheRead: 0.0002, cacheWrite: 0.001, total: 0.0042 },
			},
			...overrides,
		};
	},
};

export { Fixtures };
