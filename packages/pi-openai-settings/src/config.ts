/* eslint-disable unicorn/no-null -- Null explicitly leaves provider settings unchanged. */
import { configFilename, SettingName } from "#src/constants";
import { SettingsFile } from "#src/settings-file";
import { type ValueOf } from "@a-box-of-scraps/ts-utils";
import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const EnvironmentVariable = {
	Config: "PI_OPENAI_CONFIG",
	Enabled: "PI_OPENAI_ENABLED",
	Verbosity: "PI_OPENAI_VERBOSITY",
	ReasoningSummary: "PI_OPENAI_REASONING_SUMMARY",
	WebSearch: "PI_OPENAI_WEB_SEARCH",
	ServiceTier: "PI_OPENAI_SERVICE_TIER",
} as const;
type EnvironmentVariable = ValueOf<typeof EnvironmentVariable>;

const InputLiteral = {
	True: "true",
	False: "false",
	Null: "null",
} as const;

const Verbosity = { Low: "low", Medium: "medium", High: "high" } as const;
const ReasoningSummary = Object.freeze(
	{
		Concise: "concise",
		Auto: "auto",
		Detailed: "detailed",
		None: "none",
	} as const,
);
const ServiceTier = {
	Default: "default",
	Priority: "priority",
	Ultrafast: "ultrafast",
} as const;

const Feature = {
	override<Value>(feature: { value: Value }, value: Value | undefined): void {
		if (value !== undefined) {
			feature.value = value;
		}
	},
	valueSchema<Value extends z.ZodType>(feature: { unwrap: () => { shape: { value: Value } } }): Value {
		return feature.unwrap().shape.value;
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
	commandValues(config: OpenAISettingsConfig): Map<string, string[]> {
		const booleans = [InputLiteral.True, InputLiteral.False];
		const values = new Map<string, string[]>([[SettingName.Enabled, booleans]]);
		const features = [
			[SettingName.Verbosity, config.verbosity, Object.values(Verbosity)],
			[SettingName.ReasoningSummary, config.reasoningSummary, Object.values(ReasoningSummary)],
			[SettingName.WebSearch, config.webSearch, booleans],
			[SettingName.ServiceTier, config.serviceTier, Object.values(ServiceTier)],
		] as const;
		for (const [name, feature, options] of features) {
			if (feature.command) {
				values.set(name, [...options, InputLiteral.Null]);
			}
		}
		return values;
	},
	feature(config: OpenAISettingsConfig, name: string) {
		const [, feature] = Object.entries(config).find(([key]) => key === name) ?? [];
		const isFeature = feature !== undefined && typeof feature !== "boolean";
		if (!isFeature) {
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
		let config = OpenAISettingsConfig.defaults();
		if (Environment.read(env, EnvironmentVariable.Config, z.boolean()) ?? true) {
			config = readConfig(configFilename, { scope: ConfigScope.Global }, schema) ?? config;
		}
		config.enabled = Environment.read(env, EnvironmentVariable.Enabled, z.boolean()) ?? config.enabled;
		const { shape } = schema;
		// Null is an explicit override, not a fallback to the file's value.
		Feature.override(
			config.verbosity,
			Environment.read(env, EnvironmentVariable.Verbosity, Feature.valueSchema(shape.verbosity)),
		);
		Feature.override(
			config.reasoningSummary,
			Environment.read(env, EnvironmentVariable.ReasoningSummary, Feature.valueSchema(shape.reasoningSummary)),
		);
		Feature.override(
			config.webSearch,
			Environment.read(env, EnvironmentVariable.WebSearch, Feature.valueSchema(shape.webSearch)),
		);
		Feature.override(
			config.serviceTier,
			Environment.read(env, EnvironmentVariable.ServiceTier, Feature.valueSchema(shape.serviceTier)),
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
