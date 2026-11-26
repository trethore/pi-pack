import { ResponsesPayload } from "#src/payload";
import type { SessionEntry } from "@earendil-works/pi-coding-agent";
import { z } from "zod";

const StreamEvent = {
	Created: "response.created",
	ItemDone: "response.output_item.done",
	Completed: "response.completed",
	Incomplete: "response.incomplete",
	Failed: "response.failed",
	Error: "error",
} as const;
const FIRST_INDEX = 0;
const CUSTOM = "custom";
const anchors = new Set(["reasoning", "message", "function_call", "custom_tool_call"]);
const call = z.looseObject({ type: z.literal("web_search_call"), id: z.string() });
type Call = z.infer<typeof call>;
const sequenceSchema = z.array(z.union([z.string(), call]));
const saved = z.object({ provider: z.string(), model: z.string(), sequence: sequenceSchema });
type SearchSequence = z.infer<typeof sequenceSchema>;
type ItemsByIndex = Map<number, SearchSequence>;
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

	place(sequence: SearchSequence): void {
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
	sequenceItem(this: void, item: unknown): SearchSequence {
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
	read(entry: SessionEntry, model: Model): SearchSequence {
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

const Phase = { Idle: "idle", Collecting: "collecting" } as const;
type CaptureState = { phase: typeof Phase.Idle } | {
	phase: typeof Phase.Collecting;
	items: ItemsByIndex;
};

class SearchCapture {
	private state: CaptureState = { phase: Phase.Idle };

	observe(data: unknown): SearchSequence {
		const event = ResponsesPayload.object(data);
		switch (event["type"]) {
			case StreamEvent.Created: {
				this.state = { phase: Phase.Collecting, items: new Map() };
				break;
			}
			case StreamEvent.ItemDone: {
				this.collect(event["output_index"], event["item"]);
				break;
			}
			case StreamEvent.Completed: {
				return this.finish(ResponsesPayload.object(event["response"])["output"]);
			}
			case StreamEvent.Failed:
			case StreamEvent.Incomplete:
			case StreamEvent.Error: {
				this.state = { phase: Phase.Idle };
				break;
			}
		}
		return [];
	}

	private collect(index: unknown, item: unknown): void {
		const validIndex = typeof index === "number" && Number.isSafeInteger(index) && index >= FIRST_INDEX;
		const { state } = this;
		const canCollect = state.phase === Phase.Collecting && validIndex;
		if (canCollect) {
			state.items.set(index, SearchHistory.sequenceItem(item));
		}
	}

	private takeItems(): ItemsByIndex {
		const { state } = this;
		this.state = { phase: Phase.Idle };
		// Some Responses streams send all items individually and an empty terminal output array.
		if (state.phase === Phase.Collecting) {
			return state.items;
		}
		return new Map();
	}

	private finish(output: unknown): SearchSequence {
		const items = this.takeItems();
		if (Array.isArray(output)) {
			output.forEach((item, index) => items.set(index, SearchHistory.sequenceItem(item)));
		}
		const sequence = [...items].sort(([left], [right]) => left - right).flatMap(([, group]) => group);
		if (sequence.some((item) => typeof item !== "string")) {
			return sequence;
		}
		return [];
	}
}

export { SearchCapture, SearchHistory, StreamEvent };
