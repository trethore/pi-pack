import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { ConfigScope, readConfig } from "@pi-pack/config";
import { applyEdits, modify } from "jsonc-parser";
import { z } from "zod";

const filename = "pi-openai-settings.jsonc";

function feature<T extends z.ZodType>(schema: T) {
	return z
		.strictObject({
			value: schema.nullable().default(null),
			command: z.boolean().default(false),
		})
		.prefault({});
}

const configSchema = z.strictObject({
	enabled: z.boolean().default(true),
	verbosity: feature(z.enum(["low", "medium", "high"])),
	reasoningSummary: feature(z.enum(["concise", "auto", "detailed", "none"])),
	webSearch: feature(z.boolean()),
	serviceTier: feature(z.enum(["default", "priority", "ultrafast"])),
});

export type Config = z.infer<typeof configSchema>;
export type Setting = keyof Config;

export const settingValues = {
	enabled: ["true", "false"],
	verbosity: ["low", "medium", "high", "null"],
	reasoningSummary: ["concise", "auto", "detailed", "none", "null"],
	webSearch: ["true", "false", "null"],
	serviceTier: ["default", "priority", "ultrafast", "null"],
} satisfies Record<Setting, string[]>;

const environmentNames: Record<Setting, string> = {
	enabled: "PI_OPENAI_ENABLED",
	verbosity: "PI_OPENAI_VERBOSITY",
	reasoningSummary: "PI_OPENAI_REASONING_SUMMARY",
	webSearch: "PI_OPENAI_WEB_SEARCH",
	serviceTier: "PI_OPENAI_SERVICE_TIER",
};

export function isSetting(name: string): name is Setting {
	return Object.hasOwn(settingValues, name);
}

export function parseSetting(setting: Setting, input: string): string | boolean | null {
	if (!settingValues[setting].includes(input)) {
		throw new Error(`${setting} must be one of: ${settingValues[setting].join(", ")}.`);
	}
	switch (input) {
		case "null":
			return null;
		case "true":
			return true;
		case "false":
			return false;
		default:
			return input;
	}
}

export function updateSetting(config: Config, setting: Setting, value: unknown): Config {
	return configSchema.parse({
		...config,
		[setting]: setting === "enabled" ? value : { ...config[setting], value },
	});
}

export function loadConfig(): Config {
	const configFlag = process.env.PI_OPENAI_CONFIG;
	if (configFlag !== undefined && configFlag !== "true" && configFlag !== "false") {
		throw new Error("PI_OPENAI_CONFIG must be true or false.");
	}
	let config =
		(configFlag === "false" ? undefined : readConfig(filename, { scope: ConfigScope.Global }, configSchema)) ??
		configSchema.parse({});
	for (const setting of Object.keys(settingValues)) {
		if (!isSetting(setting)) {
			continue;
		}
		const name = environmentNames[setting];
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
