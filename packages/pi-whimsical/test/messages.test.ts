import { expect, it } from "vitest";
import { defaultMessages } from "#src/messages";

it("keeps built-in messages unique and under 50 characters", () => {
  // Act
  const uniqueMessages = new Set(defaultMessages);

  // Assert
  expect(uniqueMessages.size).toBe(defaultMessages.length);
  for (const message of defaultMessages) {
    expect(message.length, message).toBeLessThan(50);
  }
});

it("includes at least 50 multi-word messages", () => {
  // Act
  const multiWordMessages = defaultMessages.filter((message) => message.trim().split(/\s+/).length > 1);

  // Assert
  expect(multiWordMessages.length).toBeGreaterThanOrEqual(50);
});
