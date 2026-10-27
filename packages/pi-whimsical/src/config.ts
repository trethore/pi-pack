import { readConfig } from "@pi-pack/config";
import { messages } from "#whimsical/messages.ts";

interface Config {
	enabled: boolean;
	messages: string[];
}

export function loadConfig(): Config {
	const value = readConfig("pi-whimsical.jsonc", { scope: "global" });
	if (value === undefined) {
		return { enabled: true, messages };
	}
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error("Expected a JSONC object.");
	}
	
	const enabled = "enabled" in value ? value.enabled : true;
	const customMessages = "messages" in value ? value.messages : [];
	if (typeof enabled !== "boolean") {
		throw new Error('"enabled" must be a boolean.');
	}
	if (
		!Array.isArray(customMessages) ||
		!customMessages.every((message: unknown): message is string => typeof message === "string")
	) {
		throw new Error('"messages" must be an array of strings.');
	}
	
	return { enabled, messages: customMessages.length > 0 ? customMessages : messages };
}
