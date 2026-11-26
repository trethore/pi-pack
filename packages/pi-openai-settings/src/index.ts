import { OpenAISettingsConfig } from "#src/config";
import { commandName } from "#src/constants";
import { OpenAISettingsController } from "#src/controller";
import { ResponsesPayload } from "#src/payload";
import { SearchHistory } from "#src/search-history";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

const NotificationLevel = { Info: "info", Error: "error" } as const;

export default async function openAISettings(pi: ExtensionAPI): Promise<void> {
	const controller = new OpenAISettingsController(await OpenAISettingsConfig.read());
	pi.on(Events.ProviderStreamEvent, (event) => {
		const shouldCapture = controller.preserveCalls && ResponsesPayload.supports(event);
		if (shouldCapture) {
			const sequence = SearchHistory.capture(event.data);
			if (sequence.length) {
				pi.appendEntry(SearchHistory.key, { provider: event.provider, model: event.model, sequence });
			}
		}
	});
	pi.on(Events.BeforeProviderRequest, (event, ctx) => {
		const { model } = ctx;
		const payload = controller.apply(event.payload, model);
		const { input } = ResponsesPayload.object(payload);
		const canReplay = model !== undefined && ResponsesPayload.isObject(payload) && Array.isArray(input);
		if (canReplay) {
			payload["input"] = SearchHistory.restore(
				input,
				ctx.sessionManager.getBranch(),
				model,
			);
		}
		return payload;
	});
	pi.registerCommand(commandName, {
		description: "Inspect or change OpenAI Responses settings and save them to the global config",
		getArgumentCompletions: (prefix) => controller.complete(prefix),
		async handler(args, ctx) {
			try {
				ctx.ui.notify(await controller.command(args), NotificationLevel.Info);
			} catch (error) {
				ctx.ui.notify(String(error), NotificationLevel.Error);
			}
		},
	});
}
