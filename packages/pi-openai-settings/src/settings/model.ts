import { z } from "zod";

function feature<T extends z.ZodType>(schema: T) {
	return z.strictObject({
		value: schema.nullable().default(null),
		command: z.boolean().default(false),
	});
}

const verbositySchema = z.enum(["low", "medium", "high"]);
const reasoningSummarySchema = z.enum(["concise", "auto", "detailed", "none"]);
const serviceTierSchema = z.enum(["default", "priority", "ultrafast"]);

export const configSchema = z.strictObject({
	enabled: z.boolean().default(true),
	verbosity: feature(verbositySchema).prefault({}),
	reasoningSummary: feature(reasoningSummarySchema).prefault({}),
	webSearch: feature(z.boolean())
		.extend({ captureResponses: z.boolean().default(true) })
		.prefault({}),
	serviceTier: feature(serviceTierSchema).prefault({}),
});

export type Config = z.infer<typeof configSchema>;
export type Setting = keyof Config;

export const settingDefinitions = {
	enabled: { values: ["true", "false"], environmentName: "PI_OPENAI_ENABLED" },
	verbosity: { values: [...verbositySchema.options, "null"], environmentName: "PI_OPENAI_VERBOSITY" },
	reasoningSummary: {
		values: [...reasoningSummarySchema.options, "null"],
		environmentName: "PI_OPENAI_REASONING_SUMMARY",
	},
	webSearch: { values: ["true", "false", "null"], environmentName: "PI_OPENAI_WEB_SEARCH" },
	serviceTier: { values: [...serviceTierSchema.options, "null"], environmentName: "PI_OPENAI_SERVICE_TIER" },
} satisfies Record<Setting, { values: string[]; environmentName: string }>;

export const settingNames = Object.keys(settingDefinitions).filter(isSetting);

export function isSetting(name: string): name is Setting {
	return Object.hasOwn(settingDefinitions, name);
}

export function parseSetting(setting: Setting, input: string): string | boolean | null {
	if (!settingDefinitions[setting].values.includes(input)) {
		throw new Error(`${setting} must be one of: ${settingDefinitions[setting].values.join(", ")}.`);
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
