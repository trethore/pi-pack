const COMMAND_NAME = "openai-settings";
const CONFIG_FILENAME = "pi-openai-settings.jsonc";
const FEATURE_VALUE_KEY = "value";

const SettingName = Object.freeze(
	{
		Enabled: "enabled",
		Verbosity: "verbosity",
		ReasoningSummary: "reasoningSummary",
		WebSearch: "webSearch",
		ServiceTier: "serviceTier",
	} as const,
);

export {
	COMMAND_NAME as commandName,
	CONFIG_FILENAME as configFilename,
	FEATURE_VALUE_KEY as featureValueKey,
	SettingName,
};
