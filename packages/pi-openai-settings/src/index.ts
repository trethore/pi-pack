import { OpenAISettingsConfig } from "#src/config";
import { commandName } from "#src/constants";
import { OpenAISettingsController } from "#src/controller";
import { defineEnum } from "@a-box-of-scraps/ts-utils";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

const NotificationLevel = defineEnum(Symbol("NotificationLevel"), { Info: "info", Error: "error" });

export default function openAISettings(pi: ExtensionAPI): void {
	const controller = new OpenAISettingsController(OpenAISettingsConfig.read());
	pi.on(Events.BeforeProviderRequest, (event, ctx) => controller.apply(event.payload, ctx.model));
	pi.registerCommand(commandName, {
		description: "Inspect or change OpenAI Responses settings and save them to the global config",
		async handler(args, ctx) {
			try {
				ctx.ui.notify(controller.command(args), NotificationLevel.Info);
			} catch (error) {
				ctx.ui.notify(String(error), NotificationLevel.Error);
			}
		},
	});
}
