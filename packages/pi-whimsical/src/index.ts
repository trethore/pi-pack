import { Events } from "@pi-pack/events";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "#whimsical/config";

export default function whimsical(pi: ExtensionAPI): void {
	let config: ReturnType<typeof loadConfig> | undefined;
	let workingMessageSet = false;

	function resetWorkingMessage(ctx: ExtensionContext): void {
		if (ctx.hasUI && workingMessageSet) {
			ctx.ui.setWorkingMessage();
		}
		workingMessageSet = false;
	}

	pi.on(Events.SessionStart, (_event, ctx) => {
		resetWorkingMessage(ctx);
		try {
			config = loadConfig();
		} catch (error) {
			config = undefined;
			if (ctx.hasUI) {
				const reason = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(
					`pi-whimsical: Could not load config. Extension inactive until a successful reload. ${reason}`,
					"error",
				);
			}
		}
	});

	pi.on(Events.TurnStart, (_event, ctx) => {
		if (!ctx.hasUI || !config?.enabled) {
			return;
		}
		const message = config.messages[Math.floor(Math.random() * config.messages.length)];
		ctx.ui.setWorkingMessage(message);
		workingMessageSet = true;
	});

	pi.on(Events.TurnEnd, (_event, ctx) => resetWorkingMessage(ctx));
	pi.on(Events.SessionShutdown, (_event, ctx) => resetWorkingMessage(ctx));
}
