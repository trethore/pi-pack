import { expect, test } from "vitest";
import { helloWorld } from "../src/index.ts";

test("returns a greeting", () => {
	expect(helloWorld()).toBe("Hello, world!");
});
