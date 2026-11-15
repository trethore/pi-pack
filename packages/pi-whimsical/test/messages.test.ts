import { messages } from "#src/messages";
import { expect, test } from "vitest";

const firstIndex = 0;
const lastIndex = -1;

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
	expect(messages.at(firstIndex)).toBe("Schlepping...");
	expect(messages.at(lastIndex)).toBe("Wondering...");
});
