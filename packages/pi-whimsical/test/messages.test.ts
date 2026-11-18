import { messages } from "#src/messages";
import { expect, test } from "vitest";

const FIRST_INDEX = 0;
const LAST_INDEX = -1;

test("contains the complete built-in list without duplicates or blank entries", () => {
	expect.hasAssertions();
	// Arrange
	const expectedCount = 295;

	// Act
	const uniqueMessages = new Set(messages);
	const invalidMessages = messages.filter((message) => message.trim() !== message || !message.endsWith("..."));

	// Assert
	expect(messages).toHaveLength(expectedCount);
	expect(uniqueMessages.size).toBe(messages.length);
	expect(invalidMessages).toStrictEqual([]);
	expect(messages.at(FIRST_INDEX)).toBe("Schlepping...");
	expect(messages.at(LAST_INDEX)).toBe("Wondering...");
});
