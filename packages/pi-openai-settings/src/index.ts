import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Events } from "@pi-pack/events";
import {
	isSetting,
	loadConfig,
	parseSetting,
	saveSetting,
	settingValues,
	updateSetting,
} from "#openai-settings/config";
import { applySettings, supportsModel } from "#openai-settings/payload";

export default function openaiSettings(pi: ExtensionAPI): void {
	let config: ReturnType<typeof loadConfig>;
	try {
		config = loadConfig();
	} catch (error) {
		const reason = error instanceof Error ? error.message : String(error);
		pi.on(Events.SessionStart, (_event, ctx) => {
			ctx.ui.notify(`pi-openai-settings: Extension inactive until a successful reload. ${reason}`, "error");
		});
		return;
	}

	pi.on(Events.BeforeProviderRequest, (event, ctx) => {
		if (supportsModel(ctx.model)) {
			applySettings(event.payload, config);
		}
	});

	const features = Object.keys(settingValues).filter(
		(name) => isSetting(name) && name !== "enabled" && config[name].command,
	);
	const commands = ["enabled", ...features];
	const usage = commands
		.filter(isSetting)
		.map((name) => `${name} <${settingValues[name].join("|")}>`)
		.join("\n");

	pi.registerCommand("openai-settings", {
		description: "Apply and save global OpenAI Responses settings",
		getArgumentCompletions(prefix) {
			const parts = prefix.trimStart().split(/\s+/u);
			const [name = "", value = ""] = parts;
			if (parts.length === 1) {
				return commands
					.filter((command) => command.startsWith(name))
					.map((command) => ({ value: command, label: command }));
			}
			if (parts.length !== 2 || !isSetting(name) || !commands.includes(name)) {
				return null;
			}
			return settingValues[name]
				.filter((option) => option.startsWith(value))
				.map((option) => ({ value: `${name} ${option}`, label: option }));
		},
		async handler(args, ctx) {
			const [name, input, extra] = args.trim().split(/\s+/u);
			if (!name || !isSetting(name) || !commands.includes(name) || input === undefined || extra !== undefined) {
				ctx.ui.notify(`Usage: /openai-settings <setting> <value>\n${usage}`, "info");
				return;
			}
			try {
				const value = parseSetting(name, input);
				const next = updateSetting(config, name, value);
				// Save first: a failed write must not look like a successful persistent override.
				saveSetting(name, value);
				config = next;
				ctx.ui.notify(
					`OpenAI ${name} = ${input}. Saved globally.${config.enabled ? "" : " Master switch is off."}`,
					"info",
				);
			} catch (error) {
				ctx.ui.notify(`pi-openai-settings: ${error instanceof Error ? error.message : String(error)}`, "error");
			}
		},
	});
}
