import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const configFilename = "pi-run-metrics.jsonc";
const defaultFormat = "<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>";

const schema = z.object({
	enabled: z.boolean().default(true),
	format: z.string().default(defaultFormat),
});

type RunMetricsConfig = z.infer<typeof schema>;

const RunMetricsConfig = {
	read(this: void): RunMetricsConfig {
		return readConfig(configFilename, { scope: ConfigScope.Global }, schema) ?? schema.parse({});
	},
};

export { RunMetricsConfig };
