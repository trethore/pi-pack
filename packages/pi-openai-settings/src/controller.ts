import { OpenAISettingsConfig } from "#src/config";
import { commandName, SettingName } from "#src/constants";
import { ResponsesPayload } from "#src/payload";
import { type ValueOf } from "@a-box-of-scraps/ts-utils";

const SettingsState = { Enabled: "enabled", Disabled: "disabled" } as const;
type SettingsState = ValueOf<typeof SettingsState>;
const COMMAND_ARGUMENT_COUNT = 2;

class OpenAISettingsController {
	private state: SettingsState = SettingsState.Disabled;
	private config: OpenAISettingsConfig;

	constructor(config: OpenAISettingsConfig) {
		this.config = config;
		this.setEnabled(config.enabled);
	}

	apply(payload: unknown, model: { provider: string; api: string } | undefined): unknown {
		const shouldApply = this.state === SettingsState.Enabled && ResponsesPayload.supports(model);
		if (!shouldApply) {
			return undefined;
		}
		return ResponsesPayload.apply(payload, this.config);
	}

	complete(prefix: string): { value: string; label: string }[] {
		const [name = "", value, extra] = prefix.trimStart().split(/\s+/u);
		const commands = OpenAISettingsConfig.commandValues(this.config);
		if (extra !== undefined) {
			return [];
		}
		if (value === undefined) {
			return [...commands.keys()]
				.filter((setting) => setting.startsWith(name))
				.map((setting) => ({ value: `${setting} `, label: setting }));
		}
		return (commands.get(name) ?? [])
			.filter((option) => option.startsWith(value))
			.map((option) => ({ value: `${name} ${option}`, label: option }));
	}

	command(args: string): string {
		if (args.trim() === "") {
			return this.describe();
		}
		const parts = args.trim().split(/\s+/u);
		const [name, value] = parts;
		const invalidArguments = parts.length !== COMMAND_ARGUMENT_COUNT || name === undefined || value === undefined;
		if (invalidArguments) {
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
