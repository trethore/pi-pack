import { expect, test } from "vitest";
import { projectOutput } from "#openai-settings/replay/pi-projection";
import type { NativeItem } from "#openai-settings/replay/schema";
import { capturedTurn } from "#openai-settings-test/replay/fixtures";

test("projects Pi's request anchors without modifying native output", () => {
	// Arrange
	const turn = capturedTurn();
	const original = structuredClone(turn.capture.output);

	// Act
	const projected = projectOutput(turn.capture.output);

	// Assert
	expect(projected).toEqual(turn.input);
	expect(turn.capture.output).toEqual(original);
});

test.each([undefined, null, "commentary", "final_answer"] as const)(
	"combines text and refusals, strips annotations, and preserves phase %s",
	(phase) => {
		// Arrange
		const message: NativeItem = {
			type: "message",
			id: "msg_combined",
			role: "assistant",
			status: "incomplete",
			phase,
			content: [
				{ type: "output_text", text: "Answer. ", annotations: [{ type: "url_citation", url: "opaque" }] },
				{ type: "refusal", refusal: "Cannot continue." },
			],
		};

		// Act
		const projected = projectOutput([message]);

		// Assert
		expect(projected).toEqual([
			{
				type: "message",
				id: message.id,
				role: "assistant",
				status: "completed",
				content: [{ type: "output_text", text: "Answer. Cannot continue.", annotations: [] }],
				...(phase ? { phase } : {}),
			},
		]);
	},
);

test.each(["{", "null", "[]", "42", '"text"'])("rejects unprojectable function arguments: %s", (args) => {
	// Arrange
	const call: NativeItem = {
		type: "function_call",
		id: "fc_args",
		call_id: "call_args",
		name: "read",
		arguments: args,
	};

	// Act
	const projected = projectOutput([call]);

	// Assert
	expect(projected).toBeUndefined();
});

test.each([64, 65])("requires unchanged message IDs at length %s", (length) => {
	// Arrange
	const message: NativeItem = {
		type: "message",
		id: "m".repeat(length),
		role: "assistant",
		status: "completed",
		content: [{ type: "output_text", text: "Answer", annotations: [] }],
	};

	// Act
	const projected = projectOutput([message]);

	// Assert
	expect(projected).toEqual(length === 64 ? [message] : undefined);
});

test.each(["function_call", "custom_tool_call"] as const)("rejects foreign %s IDs", (type) => {
	// Arrange
	const call: NativeItem = {
		type,
		id: "foreign",
		call_id: "call_foreign",
		name: "tool",
		arguments: "{}",
		input: "raw input",
	};

	// Act
	const projected = projectOutput([call]);

	// Assert
	expect(projected).toBeUndefined();
});

test("preserves custom-tool input and namespace while omitting output-only fields", () => {
	// Arrange
	const call: NativeItem = {
		type: "custom_tool_call",
		id: "ctc_raw",
		call_id: "call_raw",
		name: "grammar",
		namespace: "functions",
		input: "original\ninput",
		status: "completed",
	};

	// Act
	const projected = projectOutput([call]);

	// Assert
	expect(projected).toEqual([
		{
			type: call.type,
			id: call.id,
			call_id: call.call_id,
			name: call.name,
			namespace: call.namespace,
			input: call.input,
		},
	]);
});
