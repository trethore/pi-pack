import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const CONFIG_FILENAME = "pi-run-metrics.jsonc";
const DEFAULT_FORMAT = "<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>";

const schema = z.object({
	enabled: z.boolean().default(true),
	format: z.string().default(DEFAULT_FORMAT),
});

type RunMetricsConfig = z.infer<typeof schema>;

const RunMetricsConfig = {
	read(this: void): RunMetricsConfig {
		return readConfig(CONFIG_FILENAME, { scope: ConfigScope.Global }, schema) ?? schema.parse({});
	},
};

export { RunMetricsConfig };
