import { z } from "zod";

// Records reject non-plain objects; loose objects preserve provider-specific fields.
const objectSchema = z.record(z.string(), z.unknown());
const toolSchema = objectSchema.pipe(z.looseObject({ type: z.string() }));
const payloadSchema = objectSchema.pipe(
	z.looseObject({
		text: objectSchema.optional(),
		reasoning: objectSchema.optional(),
		tools: z.array(toolSchema).optional(),
	}),
);

export type ResponsesPayload = z.infer<typeof payloadSchema>;

export function isResponsesPayload(payload: unknown): payload is ResponsesPayload {
	// Validate without replacing the original payload with Zod's cloned output.
	return payloadSchema.safeParse(payload).success;
}

export function supportsModel(model: { provider: string; api: string } | undefined): boolean {
	return (
		model !== undefined &&
		((model.provider === "azure" && model.api === "azure-openai-responses") ||
			((model.provider === "openai" || model.provider === "github-copilot") && model.api === "openai-responses"))
	);
}
