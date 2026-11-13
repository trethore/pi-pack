import { z } from "zod";
import type { NativeItem } from "#openai-settings/replay/schema";

const objectSchema = z.record(z.string(), z.unknown());
export type ProjectedItem = Record<string, unknown> & { id: string };

/** Pi 1.5.2's reconstructed output. Exact matching fails closed if Pi's serializer or an extension changes it. */
export function projectOutput(output: NativeItem[]): ProjectedItem[] | undefined {
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
