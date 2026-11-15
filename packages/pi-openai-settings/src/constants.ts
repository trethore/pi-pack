import { defineEnum } from "@a-box-of-scraps/ts-utils";

const commandName = "openai-settings";
const configFilename = "pi-openai-settings.jsonc";
const featureValueKey = "value";

const SettingName = defineEnum(Symbol("SettingName"), {
	Enabled: "enabled",
	Verbosity: "verbosity",
	ReasoningSummary: "reasoningSummary",
	WebSearch: "webSearch",
	ServiceTier: "serviceTier",
});

export { commandName, configFilename, featureValueKey, SettingName };
