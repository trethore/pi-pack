import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import type { MessageEndEvent } from "@earendil-works/pi-coding-agent";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type { ResponseOutputItem } from "openai/resources/responses/responses";
import { projectOutput, type ProjectedItem } from "#openai-settings/replay/pi-projection";
import type { Capture, NativeItem } from "#openai-settings/replay/schema";

type AssistantMessage = Extract<MessageEndEvent["message"], { role: "assistant" }>;

/** Restore only uniquely matched, unchanged assistant spans supplied by the active session projection. */
export function restoreResponses(
	input: Record<string, unknown>[],
	captures: Capture[],
	messages: MessageEndEvent["message"][],
): Record<string, unknown>[] {
	for (const capture of captures) {
		input = restoreCapture(input, capture, messages);
	}
	return input;
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

function matchesModel(message: AssistantMessage, capture: Pick<Capture, "provider" | "api" | "model">): boolean {
	return message.provider === capture.provider && message.api === capture.api && message.model === capture.model;
}

export function hashContent(message: AssistantMessage): string {
	return createHash("sha256").update(JSON.stringify(message.content)).digest("hex");
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
