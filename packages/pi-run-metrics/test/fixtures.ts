import type { MessageEndEvent, MessageUpdateEvent } from "@earendil-works/pi-coding-agent";
export function response(output = 100): MessageEndEvent {
	return {
		type: "message_end",
		message: {
			role: "assistant",
			content: [],
			api: "openai-completions",
			provider: "openai",
			model: "test",
			timestamp: 0,
			stopReason: "stop",
			usage: {
				input: 200,
				output,
				cacheRead: 500,
				cacheWrite: 50,
				totalTokens: 850 + output,
				cost: { input: 0.001, output: 0.0032, cacheRead: 0, cacheWrite: 0, total: 0.0042 },
			},
		},
	};
}
export function delta(): MessageUpdateEvent {
	const { message } = response();
	if (message.role !== "assistant") {
		throw new Error("Expected assistant");
	}
	return {
		type: "message_update",
		message,
		assistantMessageEvent: { type: "thinking_delta", contentIndex: 0, delta: "thinking", partial: message },
	};
}
