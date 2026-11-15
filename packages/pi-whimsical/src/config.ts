import { messages } from "#src/messages";
import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const emptyListLength = 0;
const schema = z.object({
	enabled: z.boolean().default(true),
	messages: z.array(z.string().trim().nonempty()).default(messages),
});

type WhimsicalConfig = z.infer<typeof schema>;

const WhimsicalConfig = {
	read(this: void): WhimsicalConfig {
		const config = readConfig("pi-whimsical.jsonc", { scope: ConfigScope.Global }, schema) ?? schema.parse({});
		if (config.messages.length === emptyListLength) {
			config.messages = [...messages];
		}
		return config;
	},
};

export { WhimsicalConfig };
