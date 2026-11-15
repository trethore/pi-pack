import { greet } from "#src/greet";
import { expect, test } from "vitest";

test("greets the world", () => {
	expect.hasAssertions();
	expect(greet()).toBe("Hello, world!");
});
