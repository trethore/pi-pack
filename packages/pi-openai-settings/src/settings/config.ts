import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { ConfigScope, readConfig } from "@pi-pack/config";
import { applyEdits, modify } from "jsonc-parser";
import {
	configSchema,
	parseSetting,
	settingDefinitions,
	settingNames,
	updateSetting,
	type Config,
	type Setting,
} from "#openai-settings/settings/model";

const filename = "pi-openai-settings.jsonc";

export function loadConfig(): Config {
	const configFlag = process.env.PI_OPENAI_CONFIG;
	if (configFlag !== undefined && configFlag !== "true" && configFlag !== "false") {
		throw new Error("PI_OPENAI_CONFIG must be true or false.");
	}
	let config =
		(configFlag === "false" ? undefined : readConfig(filename, { scope: ConfigScope.Global }, configSchema)) ??
		configSchema.parse({});
	for (const setting of settingNames) {
		const name = settingDefinitions[setting].environmentName;
		const input = process.env[name];
		if (input !== undefined) {
			try {
				config = updateSetting(config, setting, parseSetting(setting, input));
			} catch (error) {
				throw new Error(`Invalid ${name}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
			}
		}
	}
	return config;
}

/** Edit only the requested field, preserving comments and unrelated saved values. */
export function saveSetting(setting: Setting, value: unknown): void {
	const saved = readConfig(filename, { scope: ConfigScope.Global }, configSchema);
	updateSetting(saved ?? configSchema.parse({}), setting, value);
	const directory = getAgentDir();
	const path = join(directory, filename);
	const source = saved === undefined ? "{}\n" : readFileSync(path, "utf8");
	const edits = modify(source, setting === "enabled" ? [setting] : [setting, "value"], value, {
		formattingOptions: { insertSpaces: false, tabSize: 2, eol: "\n" },
	});
	mkdirSync(directory, { recursive: true });
	writeFileSync(path, applyEdits(source, edits), "utf8");
}
