import { OpenAISettingsConfig } from "#src/config";
import { commandName } from "#src/constants";
import { OpenAISettingsController } from "#src/controller";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

const NotificationLevel = { Info: "info", Error: "error" } as const;

export default async function openAISettings(pi: ExtensionAPI): Promise<void> {
	const controller = new OpenAISettingsController(await OpenAISettingsConfig.read());
	pi.on(Events.BeforeProviderRequest, (event, ctx) => controller.apply(event.payload, ctx.model));
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
