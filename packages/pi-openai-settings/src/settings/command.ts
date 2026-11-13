import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	isSetting,
	parseSetting,
	settingDefinitions,
	settingNames,
	type Config,
	type Setting,
} from "#openai-settings/settings/model";

export function registerSettingsCommand(
	pi: ExtensionAPI,
	initialConfig: Config,
	update: (setting: Setting, value: unknown) => Config,
): void {
	const commands = settingNames.filter((name) => name === "enabled" || initialConfig[name].command);
	const usage = commands.map((name) => `${name} <${settingDefinitions[name].values.join("|")}>`).join("\n");

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
			return settingDefinitions[name].values
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
				const config = update(name, value);
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
