import { expect, test } from "vitest";
import { restoreResponses } from "#openai-settings/replay/restore";
import { capturedTurn } from "#openai-settings-test/replay/fixtures";

test("restores multiple spans without mutating inputs, captures, or retained messages", () => {
	// Arrange
	const first = capturedTurn("first");
	const second = capturedTurn("second");
	const between = { role: "user", content: "Search again." };
	const input = [...first.input, between, ...second.input];
	const captures = [first.capture, second.capture];
	const messages = [first.assistant, second.assistant];
	const original = structuredClone({ input, captures, messages });

	// Act
	const restored = restoreResponses(input, captures, messages);
	const repeated = restoreResponses(restored, captures, messages);

	// Assert
	expect(restored).toEqual([...first.output, between, ...second.output]);
	expect(restored[first.output.length]).toBe(between);
	expect(repeated).toBe(restored);
	expect({ input, captures, messages }).toEqual(original);
});

test.each([0, 2])("leaves input unchanged when %s retained assistants match", (count) => {
	// Arrange
	const turn = capturedTurn();
	const messages = Array.from({ length: count }, () => structuredClone(turn.assistant));

	// Act
	const restored = restoreResponses(turn.input, [turn.capture], messages);

	// Assert
	expect(restored).toBe(turn.input);
});

test("leaves input unchanged when retained assistant content has been edited", () => {
	// Arrange
	const turn = capturedTurn();
	turn.assistant.content = [{ type: "text", text: "Redacted" }];

	// Act
	const restored = restoreResponses(turn.input, [turn.capture], [turn.assistant]);

	// Assert
	expect(restored).toBe(turn.input);
});

test.each(["provider", "api", "model", "responseId"] as const)(
	"requires the retained assistant's %s to match the capture",
	(field) => {
		// Arrange
		const turn = capturedTurn();
		turn.assistant[field] = "different";

		// Act
		const restored = restoreResponses(turn.input, [turn.capture], [turn.assistant]);

		// Assert
		expect(restored).toBe(turn.input);
	},
);

test.each([
	["stop", true],
	["toolUse", true],
	["length", false],
	["error", false],
	["aborted", false],
] as const)("checks retained assistant stop reason: %s", (stopReason, shouldRestore) => {
	// Arrange
	const turn = capturedTurn();
	turn.assistant.stopReason = stopReason;

	// Act
	const restored = restoreResponses(turn.input, [turn.capture], [turn.assistant]);

	// Assert
	expect(restored).toEqual(shouldRestore ? turn.output : turn.input);
	expect(restored === turn.input).toBe(!shouldRestore);
});

test.each(["changed", "duplicate", "interleaved", "partial"])(
	"leaves %s request spans untouched and still restores later valid spans",
	(variant) => {
		// Arrange
		const first = capturedTurn("first");
		const second = capturedTurn("second");
		const changed = structuredClone(first.input);
		switch (variant) {
			case "changed":
				changed[0] = { ...changed[0], encrypted_content: "edited" };
				break;
			case "duplicate":
				changed.push({ ...first.reasoning });
				break;
			case "interleaved":
				changed.splice(1, 0, { role: "user", content: "Inserted" });
				break;
			case "partial":
				changed.splice(1, 0, first.search);
				break;
		}
		const input = [...changed, ...second.input];

		// Act
		const restored = restoreResponses(input, [first.capture, second.capture], [first.assistant, second.assistant]);

		// Assert
		expect(restored).toEqual([...changed, ...second.output]);
		expect(restored[0]).toBe(changed[0]);
	},
);

test("ignores top-level undefined fields when matching wire-equivalent anchors", () => {
	// Arrange
	const turn = capturedTurn();
	const input = turn.input.map((item) => ({ ...item, optional: undefined }));

	// Act
	const restored = restoreResponses(input, [turn.capture], [turn.assistant]);

	// Assert
	expect(restored).toEqual(turn.output);
});

test("clones restored metadata so later payload edits cannot modify the capture", () => {
	// Arrange
	const turn = capturedTurn();
	const original = structuredClone(turn.capture);

	// Act
	const restored = restoreResponses(turn.input, [turn.capture], [turn.assistant]);
	for (const item of restored) {
		if (Array.isArray(item.content)) {
			item.content.splice(0);
		}
	}

	// Assert
	expect(turn.capture).toEqual(original);
});
