import type { MessageEndEvent, ProviderStreamEvent } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import type { setup } from "#openai-settings-test/fixtures";

type AssistantMessage = Extract<MessageEndEvent["message"], { role: "assistant" }>;

/** Native output and the corresponding Pi 1.5.2 assistant message and request projection. */
export function searchTurn(suffix = "one") {
	const reasoning = {
		type: "reasoning",
		id: `rs_${suffix}`,
		summary: [{ type: "summary_text", text: "Check sources." }],
		encrypted_content: `encrypted-${suffix}`,
		status: "completed",
	};
	const search = {
		type: "web_search_call",
		id: `ws_${suffix}`,
		status: "completed",
		action: {
			type: "search",
			queries: ["synthetic search"],
			sources: [{ type: "url", url: "https://example.invalid" }],
		},
	};
	const text = {
		type: "message",
		id: `msg_${suffix}`,
		role: "assistant",
		status: "completed",
		phase: "commentary",
		content: [
			{
				type: "output_text",
				text: "Found a source.",
				annotations: [
					{ type: "url_citation", url: "https://example.invalid", title: "Source", start_index: 0, end_index: 5 },
				],
			},
		],
	};
	const call = {
		type: "function_call",
		id: `fc_${suffix}`,
		call_id: `call_${suffix}`,
		name: "read",
		arguments: '{ "path": "example.txt", "limit": 1e2 }',
		status: "completed",
		namespace: "functions",
	};
	const output: Record<string, unknown>[] = [reasoning, search, text, call];
	const input: Record<string, unknown>[] = [
		structuredClone(reasoning),
		{ ...text, content: [{ type: "output_text", text: "Found a source.", annotations: [] }] },
		{
			type: call.type,
			id: call.id,
			call_id: call.call_id,
			name: call.name,
			namespace: call.namespace,
			arguments: '{"path":"example.txt","limit":100}',
		},
	];
	const assistant: AssistantMessage = {
		role: "assistant",
		api: "openai-responses",
		provider: "openai",
		model: "test-model",
		responseId: `resp_${suffix}`,
		content: [
			{ type: "thinking", thinking: "Check sources.", thinkingSignature: JSON.stringify(reasoning) },
			{
				type: "text",
				text: "Found a source.",
				textSignature: JSON.stringify({ v: 1, id: text.id, phase: "commentary" }),
			},
			{
				type: "toolCall",
				id: `${call.call_id}|${call.id}`,
				name: call.name,
				namespace: call.namespace,
				arguments: { path: "example.txt", limit: 100 },
			},
		],
		stopReason: "toolUse",
		timestamp: 1,
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
	};
	return { output, input, assistant, reasoning, search, text, call };
}

export function completion(turn: ReturnType<typeof searchTurn>): ProviderStreamEvent {
	return {
		type: Events.ProviderStreamEvent,
		provider: turn.assistant.provider,
		api: turn.assistant.api,
		model: turn.assistant.model,
		data: {
			type: "response.completed",
			response: { id: turn.assistant.responseId, status: "completed", output: turn.output },
		},
	};
}

/** Match Pi's ordering: provider event, message_end handlers, then assistant persistence. */
export async function finishTurn(harness: ReturnType<typeof setup>, turn: ReturnType<typeof searchTurn>) {
	await harness.emit(completion(turn));
	await harness.emit({ type: Events.MessageEnd, message: turn.assistant });
	return harness.sessionManager.appendMessage(turn.assistant);
}
