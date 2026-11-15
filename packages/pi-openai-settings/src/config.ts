/* eslint-disable unicorn/no-null -- Null explicitly leaves provider settings unchanged. */
import { configFilename, SettingName } from "#src/constants";
import { SettingsFile } from "#src/settings-file";
import { defineEnum, type EnumValue } from "@a-box-of-scraps/ts-utils";
import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const EnvironmentVariable = defineEnum(Symbol("EnvironmentVariable"), {
	Config: "PI_OPENAI_CONFIG",
	Enabled: "PI_OPENAI_ENABLED",
	Verbosity: "PI_OPENAI_VERBOSITY",
	ReasoningSummary: "PI_OPENAI_REASONING_SUMMARY",
	WebSearch: "PI_OPENAI_WEB_SEARCH",
	ServiceTier: "PI_OPENAI_SERVICE_TIER",
});
type EnvironmentVariable = EnumValue<typeof EnvironmentVariable>;

const InputLiteral = defineEnum(Symbol("InputLiteral"), {
	True: "true",
	False: "false",
	Null: "null",
});

const Verbosity = defineEnum(Symbol("Verbosity"), { Low: "low", Medium: "medium", High: "high" });
const ReasoningSummary = defineEnum(Symbol("ReasoningSummary"), {
	Concise: "concise",
	Auto: "auto",
	Detailed: "detailed",
	None: "none",
});
const ServiceTier = defineEnum(Symbol("ServiceTier"), {
	Default: "default",
	Priority: "priority",
	Ultrafast: "ultrafast",
});

const Feature = {
	override<Value>(feature: { value: Value }, value: Value | undefined): void {
		if (value !== undefined) {
			feature.value = value;
		}
	},
	schema<Value extends z.ZodType>(value: Value) {
		return z.object({ value: value.nullable().default(null), command: z.boolean().default(false) }).prefault({});
	},
};

const schema = z.object({
	enabled: z.boolean().default(true),
	verbosity: Feature.schema(z.enum(Verbosity)),
	reasoningSummary: Feature.schema(z.enum(ReasoningSummary)),
	webSearch: Feature.schema(z.boolean()),
	serviceTier: Feature.schema(z.enum(ServiceTier)),
});

type OpenAISettingsConfig = z.infer<typeof schema>;

const SettingValue = {
	enabled(raw: string): boolean {
		const enabled = z.boolean().safeParse(SettingValue.parse(raw));
		if (!enabled.success) {
			throw new Error(`Invalid ${SettingName.Enabled}: expected ${InputLiteral.True} or ${InputLiteral.False}.`);
		}
		return enabled.data;
	},
	parse(raw: string): unknown {
		switch (raw) {
			case InputLiteral.True: {
				return true;
			}
			case InputLiteral.False: {
				return false;
			}
			case InputLiteral.Null: {
				return null;
			}
			default: {
				return raw;
			}
		}
	},
};

const Environment = {
	read<Value>(env: NodeJS.ProcessEnv, name: EnvironmentVariable, valueSchema: z.ZodType<Value>): Value | undefined {
		const raw = env[name];
		if (raw === undefined) {
			return undefined;
		}
		const result = valueSchema.safeParse(SettingValue.parse(raw));
		if (!result.success) {
			throw new Error(`Invalid ${name}: ${z.prettifyError(result.error)}`);
		}
		return result.data;
	},
};

const OpenAISettingsConfig = {
	feature(config: OpenAISettingsConfig, name: string) {
		const [, feature] = Object.entries(config).find(([key]) => key === name) ?? [];
		if (feature === undefined || typeof feature === "boolean") {
			throw new Error(`Unknown setting: ${name}.`);
		}
		if (!feature.command) {
			throw new Error(`The ${name} command is disabled in the global config.`);
		}
		return feature;
	},
	defaults(): OpenAISettingsConfig {
		return schema.parse({});
	},
	read(this: void, env: NodeJS.ProcessEnv = process.env): OpenAISettingsConfig {
		const readGlobal = Environment.read(env, EnvironmentVariable.Config, z.boolean()) ?? true;
		let config = OpenAISettingsConfig.defaults();
		if (readGlobal) {
			config = readConfig(configFilename, { scope: ConfigScope.Global }, schema) ?? config;
		}
		config.enabled = Environment.read(env, EnvironmentVariable.Enabled, z.boolean()) ?? config.enabled;
		// Null is an explicit override, not a fallback to the file's value.
		Feature.override(
			config.verbosity,
			Environment.read(env, EnvironmentVariable.Verbosity, schema.shape.verbosity.unwrap().shape.value),
		);
		Feature.override(
			config.reasoningSummary,
			Environment.read(env, EnvironmentVariable.ReasoningSummary, schema.shape.reasoningSummary.unwrap().shape.value),
		);
		Feature.override(
			config.webSearch,
			Environment.read(env, EnvironmentVariable.WebSearch, schema.shape.webSearch.unwrap().shape.value),
		);
		Feature.override(
			config.serviceTier,
			Environment.read(env, EnvironmentVariable.ServiceTier, schema.shape.serviceTier.unwrap().shape.value),
		);
		return config;
	},
	save(this: void, name: string, raw: string): void {
		SettingsFile.save(name, SettingValue.parse(raw));
	},
	update(config: OpenAISettingsConfig, name: string, raw: string): OpenAISettingsConfig {
		if (name === SettingName.Enabled) {
			return { ...config, enabled: SettingValue.enabled(raw) };
		}
		const feature = OpenAISettingsConfig.feature(config, name);
		const result = schema.safeParse({ ...config, [name]: { ...feature, value: SettingValue.parse(raw) } });
		if (!result.success) {
			throw new Error(`Invalid ${name}: ${z.prettifyError(result.error)}`);
		}
		return result.data;
	},
};

export { OpenAISettingsConfig, ReasoningSummary };
