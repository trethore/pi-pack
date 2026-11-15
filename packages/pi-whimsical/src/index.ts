import { WhimsicalConfig } from "#src/config";
import { type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";

export default function whimsical(pi: ExtensionAPI): void {
	const config = WhimsicalConfig.read();
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
