import { OpenAISettingsConfig } from "#src/config";
import { commandName, SettingName } from "#src/constants";
import { ResponsesPayload } from "#src/payload";
import { defineEnum, type EnumValue } from "@a-box-of-scraps/ts-utils";

const SettingsState = defineEnum(Symbol("SettingsState"), { Enabled: "enabled", Disabled: "disabled" });
type SettingsState = EnumValue<typeof SettingsState>;
const commandArgumentCount = 2;

class OpenAISettingsController {
	private state: SettingsState = SettingsState.Disabled;
	private config: OpenAISettingsConfig;

	constructor(config: OpenAISettingsConfig) {
		this.config = config;
		this.setEnabled(config.enabled);
	}

	apply(payload: unknown, model: { provider: string; api: string } | undefined): unknown {
		if (this.state === SettingsState.Disabled || !ResponsesPayload.supports(model)) {
			return undefined;
		}
		return ResponsesPayload.apply(payload, this.config);
	}

	command(args: string): string {
		if (args.trim() === "") {
			return this.describe();
		}
		const parts = args.trim().split(/\s+/u);
		const [name, value] = parts;
		if (parts.length !== commandArgumentCount || name === undefined || value === undefined) {
			throw new Error(`Usage: /${commandName} <${Object.values(SettingName).join("|")}> <value>`);
		}
		this.update(name, value);
		return `${name} = ${value} (saved to global config)`;
	}

	private update(name: string, value: string): void {
		const config = OpenAISettingsConfig.update(this.config, name, value);
		// Persist only this command's value, never unrelated environment overrides.
		OpenAISettingsConfig.save(name, value);
		this.config = config;
		this.setEnabled(config.enabled);
	}

	private setEnabled(enabled: boolean): void {
		this.state = SettingsState.Disabled;
		if (enabled) {
			this.state = SettingsState.Enabled;
		}
	}

	private describe(): string {
		const settings = Object.entries(this.config)
			.flatMap(([name, feature]) => {
				if (typeof feature === "boolean") {
					return [];
				}
				return `${name} = ${String(feature.value)} (command ${String(feature.command)})`;
			});
		return [`${SettingName.Enabled} = ${String(this.state === SettingsState.Enabled)}`, ...settings].join("\n");
	}
}

export { OpenAISettingsController };
