import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { ExtensionAPI, ExtensionContext, MessageEndEvent } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseOutputItem } from "openai/resources/responses/responses";
import { z } from "zod";
import { isResponsesPayload, supportsModel } from "#openai-settings/payload";

const ENTRY_TYPE = "pi-openai-settings.responses";
// Warm requests have no message_end event. Bound their unclaimed captures independently of conversation length.
const MAX_PENDING_RESPONSES = 8;
const objectSchema = z.record(z.string(), z.unknown());
const id = z.string().min(1);
const status = z.enum(["in_progress", "completed", "incomplete"]);
const outputItemSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("reasoning"),
		id,
		summary: z.array(z.looseObject({ type: z.literal("summary_text"), text: z.string() })),
		encrypted_content: z.string().nullable().optional(),
	}),
	z.looseObject({
		type: z.literal("message"),
		id,
		role: z.literal("assistant"),
		status,
		phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
		content: z.array(
			z.discriminatedUnion("type", [
				z.looseObject({ type: z.literal("output_text"), text: z.string(), annotations: z.array(objectSchema) }),
				z.looseObject({ type: z.literal("refusal"), refusal: z.string() }),
			]),
		),
	}),
	z.looseObject({
		type: z.literal("function_call"),
		id,
		call_id: id,
		name: id,
		arguments: z.string(),
		namespace: z.string().optional(),
	}),
	z.looseObject({
		type: z.literal("custom_tool_call"),
		id,
		call_id: id,
		name: id,
		input: z.string(),
		namespace: z.string().optional(),
	}),
	z.looseObject({
		type: z.literal("web_search_call"),
		id,
		status: z.enum(["in_progress", "searching", "completed", "failed", "incomplete"]),
		action: objectSchema.pipe(z.looseObject({ type: z.string() })),
	}),
]);
const outputSchema = z
	.array(outputItemSchema)
	.min(1)
	.refine((items) => new Set(items.map((item) => item.id)).size === items.length);
const completedSchema = z.object({
	type: z.literal("response.completed"),
	response: z.object({ id, status: z.literal("completed"), output: outputSchema }),
});
const captureSchema = z
	.object({
		version: z.literal(1),
		provider: id,
		api: id,
		model: id,
		responseId: id,
		contentHash: z.string(),
		output: outputSchema,
	})
	.refine(supportsModel);
const requestSchema = z.looseObject({ model: id, input: z.array(objectSchema) });
type NativeItem = z.infer<typeof outputItemSchema>;
type Capture = z.infer<typeof captureSchema>;
type PendingCapture = { data: Omit<Capture, "contentHash">; sessionId: string };
type AssistantMessage = Extract<MessageEndEvent["message"], { role: "assistant" }>;
type ProjectedItem = Record<string, unknown> & { id: string };

/** Capture native search responses outside model context, then restore only unchanged, retained assistant spans. */
export function createResponseReplay(pi: ExtensionAPI, enabled: () => boolean) {
	const pending = new Map<string, PendingCapture>();
	const clear = () => pending.clear();
	pi.on(Events.SessionStart, clear);
	pi.on(Events.SessionShutdown, clear);
	pi.on(Events.AgentSettled, clear);

	pi.on(Events.ProviderStreamEvent, (event, ctx) => {
		if (!enabled() || !supportsModel(event)) {
			return;
		}
		const parsed = completedSchema.safeParse(event.data);
		if (!parsed.success || !parsed.data.response.output.some((item) => item.type === "web_search_call")) {
			return;
		}
		const response = parsed.data.response;
		pending.set(responseKey(response.id, event), {
			sessionId: ctx.sessionManager.getSessionId(),
			data: {
				version: 1,
				provider: event.provider,
				api: event.api,
				model: event.model,
				responseId: response.id,
				// Zod passthrough fields can still share nested objects with the provider event.
				output: structuredClone(response.output),
			},
		});
		if (pending.size > MAX_PENDING_RESPONSES) {
			const oldest = pending.keys().next().value;
			if (oldest !== undefined) {
				pending.delete(oldest);
			}
		}
	});

	pi.on(Events.MessageEnd, ({ message }, ctx) => {
		if (message.role !== "assistant" || !message.responseId) {
			return;
		}
		const key = responseKey(message.responseId, message);
		const capture = pending.get(key);
		pending.delete(key);
		if (
			!enabled() ||
			!capture ||
			capture.sessionId !== ctx.sessionManager.getSessionId() ||
			(message.stopReason !== "stop" && message.stopReason !== "toolUse")
		) {
			return;
		}
		// Pi persists the assistant after message_end handlers, so this entry also survives forks at that assistant.
		pi.appendEntry<Capture>(ENTRY_TYPE, { ...capture.data, contentHash: hashContent(message) });
	});

	function restore(payload: unknown, ctx: ExtensionContext): void {
		const model = ctx.model;
		if (
			!enabled() ||
			!model ||
			!supportsModel(model) ||
			!isResponsesPayload(payload) ||
			!isReplayRequest(payload) ||
			// Azure's request model can be a deployment alias rather than Pi's model ID.
			(model.provider !== "azure" && payload.model !== model.id)
		) {
			return;
		}
		const captures = ctx.sessionManager.getBranch().flatMap((entry) => {
			if (entry.type !== "custom" || entry.customType !== ENTRY_TYPE) {
				return [];
			}
			const parsed = captureSchema.safeParse(entry.data);
			return parsed.success &&
				parsed.data.provider === model.provider &&
				parsed.data.api === model.api &&
				parsed.data.model === model.id
				? [parsed.data]
				: [];
		});
		if (captures.length === 0) {
			return;
		}
		const messages = ctx.sessionManager.buildSessionProjection().messages;
		for (const capture of captures) {
			payload.input = restoreCapture(payload.input, capture, messages);
		}
	}
	return { restore };
}

function restoreCapture(
	input: Record<string, unknown>[],
	capture: Capture,
	messages: MessageEndEvent["message"][],
): Record<string, unknown>[] {
	const retained = messages.filter(
		(message): message is AssistantMessage =>
			message.role === "assistant" && message.responseId === capture.responseId && matchesModel(message, capture),
	);
	const message = retained[0];
	if (
		retained.length !== 1 ||
		!message ||
		hashContent(message) !== capture.contentHash ||
		(message.stopReason !== "stop" && message.stopReason !== "toolUse")
	) {
		return input;
	}
	const expected = projectOutput(capture.output);
	if (!expected || expected.length === 0) {
		return input;
	}
	const start = findSpan(input, expected, capture.output);
	if (start === undefined) {
		return input;
	}
	// The boundary schema checks the supported discriminators and every field used for matching.
	// Other provider fields (annotations, reasoning metadata, search actions) stay opaque and unchanged.
	// oxlint-disable-next-line typescript/no-unsafe-type-assertion
	const replacement = toResponseInputItems(structuredClone(capture.output) as ResponseOutputItem[]).map((item) => ({
		...item,
	}));
	return [...input.slice(0, start), ...replacement, ...input.slice(start + expected.length)];
}

function isReplayRequest(payload: unknown): payload is z.infer<typeof requestSchema> {
	return requestSchema.safeParse(payload).success;
}

/** Response IDs belong to a provider/model, not a global namespace shared by all pending requests. */
function responseKey(responseId: string, source: Pick<Capture, "provider" | "api" | "model">): string {
	return JSON.stringify([source.provider, source.api, source.model, responseId]);
}

function matchesModel(message: AssistantMessage, capture: Pick<Capture, "provider" | "api" | "model">): boolean {
	return message.provider === capture.provider && message.api === capture.api && message.model === capture.model;
}

function hashContent(message: AssistantMessage): string {
	return createHash("sha256").update(JSON.stringify(message.content)).digest("hex");
}

/** Pi 1.5.2's reconstructed output. Exact matching fails closed if Pi's serializer or an extension changes it. */
function projectOutput(output: NativeItem[]): ProjectedItem[] | undefined {
	const projected: ProjectedItem[] = [];
	for (const item of output) {
		if (item.type === "web_search_call") {
			continue;
		}
		const next = projectItem(item);
		if (!next) {
			return undefined;
		}
		projected.push(next);
	}
	return projected;
}

function projectItem(item: Exclude<NativeItem, { type: "web_search_call" }>): ProjectedItem | undefined {
	switch (item.type) {
		case "reasoning":
			return item;
		case "message":
			// Pi hashes overlong message IDs, so they cannot be used as unchanged native anchors here.
			if (item.id.length > 64) {
				return undefined;
			}
			return {
				type: "message",
				id: item.id,
				role: "assistant",
				status: "completed",
				content: [
					{
						type: "output_text",
						text: item.content.map((part) => (part.type === "output_text" ? part.text : part.refusal)).join(""),
						annotations: [],
					},
				],
				...(item.phase ? { phase: item.phase } : {}),
			};
		case "function_call": {
			if (!item.id.startsWith("fc_")) {
				return undefined;
			}
			let args: unknown;
			try {
				args = JSON.parse(item.arguments);
			} catch {
				return undefined;
			}
			if (!objectSchema.safeParse(args).success) {
				return undefined;
			}
			return {
				type: "function_call",
				id: item.id,
				call_id: item.call_id,
				name: item.name,
				arguments: JSON.stringify(args),
				...(item.namespace !== undefined ? { namespace: item.namespace } : {}),
			};
		}
		case "custom_tool_call":
			if (!item.id.startsWith("ctc_")) {
				return undefined;
			}
			return {
				type: "custom_tool_call",
				id: item.id,
				call_id: item.call_id,
				name: item.name,
				input: item.input,
				...(item.namespace !== undefined ? { namespace: item.namespace } : {}),
			};
		default:
			return undefined;
	}
}

function findSpan(
	input: Record<string, unknown>[],
	expected: ProjectedItem[],
	output: NativeItem[],
): number | undefined {
	const positions = new Map<string, number[]>();
	for (const [index, item] of input.entries()) {
		if (typeof item.id === "string") {
			const indices = positions.get(item.id) ?? [];
			indices.push(index);
			positions.set(item.id, indices);
		}
	}
	// Already restored, partially restored, or supplied by another extension: never duplicate native items.
	if (output.some((item) => item.type === "web_search_call" && positions.has(item.id))) {
		return undefined;
	}
	const first = expected[0];
	const start = first ? positions.get(first.id)?.[0] : undefined;
	if (start === undefined) {
		return undefined;
	}
	const matches = expected.every((item, offset) => {
		const indices = positions.get(item.id);
		const actual = input[start + offset];
		// The provider builds optional fields as undefined; they disappear on the wire.
		return (
			indices?.length === 1 &&
			indices[0] === start + offset &&
			actual !== undefined &&
			isDeepStrictEqual(Object.fromEntries(Object.entries(actual).filter(([, value]) => value !== undefined)), item)
		);
	});
	return matches ? start : undefined;
}
