import { OpenAISettingsConfig } from "#src/config";

const TestCommand = {
	Enable: "enabled true",
	Disable: "enabled false",
	HighVerbosity: "verbosity high",
	EnableWebSearch: "webSearch true",
} as const;

const Fixtures = {
	async config(env: NodeJS.ProcessEnv = {}): Promise<OpenAISettingsConfig> {
		const config = await OpenAISettingsConfig.read({ ...env, PI_OPENAI_CONFIG: "false" });
		for (const feature of Object.values(config)) {
			if (typeof feature !== "boolean") {
				feature.command = true;
			}
		}
		return config;
	},
	model: { provider: "openai", api: "openai-responses" },
};

export { Fixtures, TestCommand };
