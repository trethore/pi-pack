import { ResponsesPayload } from "#src/payload";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const COMPLETE = "response.completed";
const CUSTOM = "custom";
const anchors = new Set(["reasoning", "message", "function_call", "custom_tool_call"]);
const call = z.looseObject({ type: z.literal("web_search_call"), id: z.string() });
type Call = z.infer<typeof call>;
const sequenceSchema = z.array(z.union([z.string(), call]));
const saved = z.object({ provider: z.string(), model: z.string(), sequence: sequenceSchema });
type Saved = z.infer<typeof saved>;
interface Model {
	provider: string;
	id: string;
}

class Replay {
	private readonly ids: Set<unknown>;
	private readonly before = new Map<string, Call[]>();
	private readonly after = new Map<string, Call[]>();

	constructor(input: unknown[]) {
		this.ids = new Set(input.map((item) => ResponsesPayload.object(item)["id"]));
	}

	place(sequence: Saved["sequence"]): void {
		let pending: Call[] = [];
		let lastAnchor = "";
		for (const item of sequence) {
			if (typeof item === "string") {
				this.insert(this.before, item, pending);
				lastAnchor = item;
				pending = [];
			} else {
				pending.push(item);
			}
		}
		this.insert(this.after, lastAnchor, pending);
	}

	private insert(target: Map<string, Call[]>, anchor: string, calls: Call[]): void {
		if (!this.ids.has(anchor)) {
			return;
		}
		const missing = calls.filter((item) => !this.ids.has(item.id));
		if (missing.length) {
			target.set(anchor, [...target.get(anchor) ?? [], ...missing]);
			for (const item of missing) {
				this.ids.add(item.id);
			}
		}
	}

	expand(item: unknown): unknown[] {
		const { id } = ResponsesPayload.object(item);
		if (typeof id !== "string") {
			return [item];
		}
		return [...this.before.get(id) ?? [], item, ...this.after.get(id) ?? []];
	}
}

const SearchHistory = {
	key: "pi-openai-settings:web-search-calls",
	sequenceItem(this: void, item: unknown): Saved["sequence"] {
		const parsed = call.safeParse(item);
		if (parsed.success) {
			return [parsed.data];
		}
		const { type, id } = ResponsesPayload.object(item);
		const isAnchor = typeof type === "string" && anchors.has(type) && typeof id === "string";
		if (isAnchor) {
			return [id];
		}
		return [];
	},
	capture(data: unknown): Saved["sequence"] {
		const event = ResponsesPayload.object(data);
		if (event["type"] === COMPLETE) {
			const { output } = ResponsesPayload.object(event["response"]);
			if (Array.isArray(output)) {
				const sequence = output.flatMap(SearchHistory.sequenceItem);
				if (sequence.some((item) => typeof item !== "string")) {
					return sequence;
				}
			}
		}
		return [];
	},
	read(entry: SessionEntry, model: Model): Saved["sequence"] {
		const isSearchHistory = entry.type === CUSTOM && entry.customType === SearchHistory.key;
		if (isSearchHistory) {
			const parsed = saved.safeParse(entry.data);
			const sameModel = parsed.success && parsed.data.provider === model.provider && parsed.data.model === model.id;
			if (sameModel) {
				return parsed.data.sequence;
			}
		}
		return [];
	},
	restore(input: unknown[], entries: SessionEntry[], model: Model): unknown[] {
		const replay = new Replay(input);
		for (const entry of entries) {
			replay.place(SearchHistory.read(entry, model));
		}
		return input.flatMap((item) => replay.expand(item));
	},
};

export { SearchHistory };
