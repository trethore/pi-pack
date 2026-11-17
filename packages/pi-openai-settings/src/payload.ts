import { type OpenAISettingsConfig, ReasoningSummary } from "#src/config";

const Provider = {
	OpenAI: "openai",
	Azure: "azure",
	GitHubCopilot: "github-copilot",
} as const;

const Api = {
	OpenAIResponses: "openai-responses",
	AzureOpenAIResponses: "azure-openai-responses",
} as const;

const webSearchToolType = "web_search";

interface ResponsesPayload extends Record<string, unknown> {
	text?: unknown;
	reasoning?: unknown;
	tools?: unknown;
	service_tier?: unknown;
}

const ResponsesPayload = {
	isObject(value: unknown): value is ResponsesPayload {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	},
	object(value: unknown): ResponsesPayload {
		if (ResponsesPayload.isObject(value)) {
			return value;
		}
		return {};
	},
	supports(model: { provider: string; api: string } | undefined): boolean {
		if (model === undefined) {
			return false;
		}
		return ((model.provider === Provider.OpenAI || model.provider === Provider.GitHubCopilot)
			&& model.api === Api.OpenAIResponses)
			|| (model.provider === Provider.Azure && model.api === Api.AzureOpenAIResponses);
	},
	isWebSearch(tool: unknown): boolean {
		if (!ResponsesPayload.isObject(tool)) {
			return false;
		}
		const { type } = tool;
		return typeof type === "string" && (type === webSearchToolType || type.startsWith(`${webSearchToolType}_`));
	},
	apply(payload: unknown, config: OpenAISettingsConfig): unknown {
		if (!ResponsesPayload.isObject(payload)) {
			return payload;
		}
		const result = { ...payload };
		if (config.verbosity.value !== null) {
			result.text = { ...ResponsesPayload.object(payload.text), verbosity: config.verbosity.value };
		}
		ResponsesPayload.reasoning(result, config.reasoningSummary.value);
		ResponsesPayload.tools(result, config.webSearch.value);
		if (config.serviceTier.value !== null) {
			result.service_tier = config.serviceTier.value;
		}
		return result;
	},
	reasoning(payload: ResponsesPayload, summary: OpenAISettingsConfig["reasoningSummary"]["value"]): void {
		if (summary === null) {
			return;
		}
		if (summary !== ReasoningSummary.None) {
			payload.reasoning = { ...ResponsesPayload.object(payload.reasoning), summary };
			return;
		}
		if (ResponsesPayload.isObject(payload.reasoning)) {
			const reasoning = { ...payload.reasoning };
			delete reasoning["summary"];
			payload.reasoning = reasoning;
		}
	},
	tools(payload: ResponsesPayload, enabled: boolean | null): void {
		if (enabled === null) {
			return;
		}
		if (!Array.isArray(payload.tools)) {
			if (enabled) {
				payload.tools = [{ type: webSearchToolType }];
			}
			return;
		}
		payload.tools = ResponsesPayload.searchTools(payload.tools, enabled);
	},
	searchTools(existing: unknown[], enabled: boolean): unknown[] {
		if (!enabled) {
			return existing.filter((tool) => !ResponsesPayload.isWebSearch(tool));
		}
		// Preserve configured search options and avoid duplicate hosted tools on repeated requests.
		if (!existing.some((tool) => ResponsesPayload.isWebSearch(tool))) {
			return [...existing, { type: webSearchToolType }];
		}
		return existing;
	},
};

export { ResponsesPayload };
