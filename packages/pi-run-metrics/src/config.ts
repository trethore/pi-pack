import { readConfig } from "@pi-pack/config";
import { z } from "zod";

const schema = z.strictObject({
	enabled: z.boolean().default(true),
	widgetColor: z.string().default("accent"),
	format: z.string().default("<timetaken> | <tokps> | ↑ <input_tokens> ↓ <output_tokens> | <cost>"),
});

export function loadConfig(): z.infer<typeof schema> {
	return readConfig("pi-run-metrics.jsonc", { scope: "global" }, schema) ?? schema.parse({});
}
