import { z } from "zod";
import { supportsModel } from "#openai-settings/responses-boundary";

export const CAPTURE_ENTRY_TYPE = "pi-openai-settings.responses";
const objectSchema = z.record(z.string(), z.unknown());
const id = z.string().min(1);
const status = z.enum(["in_progress", "completed", "incomplete"]);
const outputItemSchema = z.discriminatedUnion("type", [
	z.looseObject({
		type: z.literal("reasoning"),
		id,
		summary: z.array(z.looseObject({ type: z.literal("summary_text"), text: z.string() })),
		encrypted_content: z.string().nullable().optional(),
	}),
	z.looseObject({
		type: z.literal("message"),
		id,
		role: z.literal("assistant"),
		status,
		phase: z.enum(["commentary", "final_answer"]).nullable().optional(),
		content: z.array(
			z.discriminatedUnion("type", [
				z.looseObject({ type: z.literal("output_text"), text: z.string(), annotations: z.array(objectSchema) }),
				z.looseObject({ type: z.literal("refusal"), refusal: z.string() }),
			]),
		),
	}),
	z.looseObject({
		type: z.literal("function_call"),
		id,
		call_id: id,
		name: id,
		arguments: z.string(),
		namespace: z.string().optional(),
	}),
	z.looseObject({
		type: z.literal("custom_tool_call"),
		id,
		call_id: id,
		name: id,
		input: z.string(),
		namespace: z.string().optional(),
	}),
	z.looseObject({
		type: z.literal("web_search_call"),
		id,
		status: z.enum(["in_progress", "searching", "completed", "failed", "incomplete"]),
		action: objectSchema.pipe(z.looseObject({ type: z.string() })),
	}),
]);
const outputSchema = z
	.array(outputItemSchema)
	.min(1)
	.refine((items) => new Set(items.map((item) => item.id)).size === items.length);
export const completedSchema = z.object({
	type: z.literal("response.completed"),
	response: z.object({ id, status: z.literal("completed"), output: outputSchema }),
});
export const captureSchema = z
	.object({
		version: z.literal(1),
		provider: id,
		api: id,
		model: id,
		responseId: id,
		contentHash: z.string(),
		output: outputSchema,
	})
	.refine(supportsModel);
const requestSchema = z.looseObject({ model: id, input: z.array(objectSchema) });
export type NativeItem = z.infer<typeof outputItemSchema>;
export type Capture = z.infer<typeof captureSchema>;

export function isReplayRequest(payload: unknown): payload is z.infer<typeof requestSchema> {
	return requestSchema.safeParse(payload).success;
}
