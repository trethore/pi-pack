import { z } from "zod";
import type { Config } from "#openai-settings/config.ts";

// Records reject non-plain objects; loose objects preserve provider-specific fields.
const objectSchema = z.record(z.string(), z.unknown());
const toolSchema = objectSchema.pipe(z.looseObject({ type: z.string() }));
const payloadSchema = objectSchema.pipe(
	z.looseObject({
		text: objectSchema.optional(),
		reasoning: objectSchema.optional(),
		tools: z.array(toolSchema).optional(),
	}),
);

type ResponsesPayload = z.infer<typeof payloadSchema>;

function isResponsesPayload(payload: unknown): payload is ResponsesPayload {
	// Validate without replacing the original payload with Zod's cloned output.
	return payloadSchema.safeParse(payload).success;
}

function isWebSearch(tool: z.infer<typeof toolSchema>): boolean {
	return tool.type === "web_search" || tool.type === "web_search_preview";
}

export function supportsModel(model: { provider: string; api: string } | undefined): boolean {
	return (
		model !== undefined &&
		((model.provider === "azure" && model.api === "azure-openai-responses") ||
			((model.provider === "openai" || model.provider === "github-copilot") && model.api === "openai-responses"))
	);
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
