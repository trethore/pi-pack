import { expect, test } from "vitest";
import { helloWorld } from "#hello-world/index.ts";

test("returns a greeting", () => {
	expect(helloWorld()).toBe("Hello, world!");
});
