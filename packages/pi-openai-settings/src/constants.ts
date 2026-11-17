const commandName = "openai-settings";
const configFilename = "pi-openai-settings.jsonc";
const featureValueKey = "value";

const SettingName = Object.freeze(
	{
		Enabled: "enabled",
		Verbosity: "verbosity",
		ReasoningSummary: "reasoningSummary",
		WebSearch: "webSearch",
		ServiceTier: "serviceTier",
	} as const,
);

export { commandName, configFilename, featureValueKey, SettingName };
