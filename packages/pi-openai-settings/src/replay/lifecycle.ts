import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { hashContent, restoreResponses } from "#openai-settings/replay/restore";
import {
	CAPTURE_ENTRY_TYPE,
	captureSchema,
	completedSchema,
	isReplayRequest,
	type Capture,
} from "#openai-settings/replay/schema";
import { isResponsesPayload, supportsModel } from "#openai-settings/responses-boundary";

// Warm requests have no message_end event. Bound their unclaimed captures independently of conversation length.
const MAX_PENDING_RESPONSES = 8;
type PendingCapture = { data: Omit<Capture, "contentHash">; sessionId: string };

/** Capture native search responses outside model context, then restore only unchanged, retained assistant spans. */
export function registerResponseReplay(pi: ExtensionAPI, enabled: () => boolean) {
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
		pi.appendEntry<Capture>(CAPTURE_ENTRY_TYPE, { ...capture.data, contentHash: hashContent(message) });
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
			if (entry.type !== "custom" || entry.customType !== CAPTURE_ENTRY_TYPE) {
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
		payload.input = restoreResponses(payload.input, captures, messages);
	}
	return { restore };
}

/** Response IDs belong to a provider/model, not a global namespace shared by all pending requests. */
function responseKey(responseId: string, source: Pick<Capture, "provider" | "api" | "model">): string {
	return JSON.stringify([source.provider, source.api, source.model, responseId]);
}
