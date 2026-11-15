import { OpenAISettingsConfig } from "#src/config";

const Fixtures = {
	config(env: NodeJS.ProcessEnv = {}): OpenAISettingsConfig {
		const config = OpenAISettingsConfig.read({ ...env, PI_OPENAI_CONFIG: "false" });
		for (const feature of Object.values(config)) {
			if (typeof feature !== "boolean") {
				feature.command = true;
			}
		}
		return config;
	},
	model: { provider: "openai", api: "openai-responses" },
};

export { Fixtures };
