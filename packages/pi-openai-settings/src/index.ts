import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import { registerResponseReplay } from "#openai-settings/replay/lifecycle";
import { supportsModel } from "#openai-settings/responses-boundary";
import { applySettings } from "#openai-settings/settings/apply";
import { registerSettingsCommand } from "#openai-settings/settings/command";
import { loadConfig, saveSetting } from "#openai-settings/settings/config";
import { updateSetting, type Config } from "#openai-settings/settings/model";

export default function openaiSettings(pi: ExtensionAPI): void {
	let config: Config;
	try {
		config = loadConfig();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		pi.on(Events.SessionStart, (_event, ctx) => {
			ctx.ui.notify(`pi-openai-settings: Extension inactive until a successful reload. ${reason}`, "error");
		});
		return;
	}

	const replay = registerResponseReplay(pi, () => config.enabled && config.webSearch.captureResponses);

	pi.on(Events.BeforeProviderRequest, (event, ctx) => {
		if (supportsModel(ctx.model)) {
			applySettings(event.payload, config);
			replay.restore(event.payload, ctx);
		}
	});

	registerSettingsCommand(pi, config, (name, value) => {
		const next = updateSetting(config, name, value);
		// Save first: a failed write must not look like a successful persistent override.
		saveSetting(name, value);
		config = next;
		return config;
	});
}
