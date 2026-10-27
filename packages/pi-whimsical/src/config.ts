import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";
import { messages } from "#whimsical/messages.ts";

const configSchema = z.strictObject({
	enabled: z.boolean().default(true),
	messages: z.array(z.string()).default([]),
});

type Config = z.infer<typeof configSchema>;

export function loadConfig(): Config {
	const config =
		readConfig("pi-whimsical.jsonc", { scope: ConfigScope.Global }, configSchema) ?? configSchema.parse({});
	return { ...config, messages: config.messages.length > 0 ? config.messages : messages };
}
