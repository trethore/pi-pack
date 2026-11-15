import { ConfigScope, readConfig } from "@pi-pack/config";
import { z } from "zod";

const schema = z.object({
	enabled: z.boolean().default(true),
	format: z.string().default("<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>"),
});

type RunMetricsConfig = z.infer<typeof schema>;

const RunMetricsConfig = {
	read(this: void): RunMetricsConfig {
		return readConfig("pi-run-metrics.jsonc", { scope: ConfigScope.Global }, schema) ?? schema.parse({});
	},
};

export { RunMetricsConfig };
