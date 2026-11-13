import { isResponsesPayload, type ResponsesPayload } from "#openai-settings/responses-boundary";
import type { Config } from "#openai-settings/settings/model";

const webSearchTypes = new Set([
	"web_search",
	"web_search_preview",
	"web_search_2025_08_26",
	"web_search_preview_2025_03_11",
]);

function isWebSearch(tool: { type: string }): boolean {
	return webSearchTypes.has(tool.type);
}

/** Modify only configured fields; null deliberately preserves the provider's payload. */
export function applySettings(payload: unknown, config: Config): void {
	if (!config.enabled || !isResponsesPayload(payload)) {
		return;
	}
	if (config.verbosity.value !== null) {
		payload.text = { ...payload.text, verbosity: config.verbosity.value };
	}
	const summary = config.reasoningSummary.value;
	if (summary === "none") {
		if (payload.reasoning !== undefined) {
			delete payload.reasoning.summary;
		}
	} else if (summary !== null) {
		payload.reasoning = { ...payload.reasoning, summary };
	}
	if (config.serviceTier.value !== null) {
		payload.service_tier = config.serviceTier.value;
	}
	applyWebSearch(payload, config.webSearch.value);
}

function applyWebSearch(payload: ResponsesPayload, enabled: boolean | null): void {
	if (enabled === null) {
		return;
	}
	const tools = payload.tools ?? [];
	if (enabled && !tools.some(isWebSearch)) {
		payload.tools = [...tools, { type: "web_search" }];
	} else if (!enabled && tools.some(isWebSearch)) {
		payload.tools = tools.filter((tool) => !isWebSearch(tool));
	}
}
