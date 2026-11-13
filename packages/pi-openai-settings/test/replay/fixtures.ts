import { hashContent } from "#openai-settings/replay/restore";
import { captureSchema } from "#openai-settings/replay/schema";
import { searchTurn } from "#openai-settings-test/response-fixtures";

export function capturedTurn(suffix = "one") {
	const turn = searchTurn(suffix);
	const capture = captureSchema.parse({
		version: 1,
		provider: turn.assistant.provider,
		api: turn.assistant.api,
		model: turn.assistant.model,
		responseId: turn.assistant.responseId,
		contentHash: hashContent(turn.assistant),
		output: turn.output,
	});
	return { ...turn, capture };
}
