import { messages } from "#src/messages";
import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const CONFIG_FILENAME = "pi-whimsical.jsonc";
const EMPTY_LIST_LENGTH = 0;
const schema = z.object({
	enabled: z.boolean().default(true),
	messages: z.array(z.string().trim().nonempty()).default(messages),
});

type WhimsicalConfig = z.infer<typeof schema>;

const WhimsicalConfig = {
	async read(this: void): Promise<WhimsicalConfig> {
		const config = await readConfig(CONFIG_FILENAME, { scope: ConfigScope.Global }, schema) ?? schema.parse({});
		if (config.messages.length === EMPTY_LIST_LENGTH) {
			config.messages = [...messages];
		}
		return config;
	},
};

export { WhimsicalConfig };
