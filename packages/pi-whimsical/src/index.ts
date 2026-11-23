import { WhimsicalConfig } from "#src/config";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

export default async function whimsical(pi: ExtensionAPI): Promise<void> {
	const config = await WhimsicalConfig.read();
	if (!config.enabled) {
		return;
	}

	pi.on(Events.TurnStart, (_event, ctx) => {
		if (!ctx.hasUI) {
			return;
		}
		const message = config.messages[Math.floor(Math.random() * config.messages.length)];
		ctx.ui.setWorkingMessage(message);
	});
}
