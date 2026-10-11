import { afterEach, describe, expect, it } from "vitest";
import { CodemodeSandbox } from "#src/sandbox/sandbox";
import { isWorkerToHostMessage } from "#src/sandbox/protocol";

const sandboxes: CodemodeSandbox[] = [];
afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

describe("sandbox boundaries", () => {
  it.each([
    { type: "output", item: { type: "text", text: 42 } },
    { type: "call", id: "1", name: "x", target: "tool" },
    { type: "done", ok: true, writes: null },
  ])("rejects malformed worker messages: %j", (message) => {
    // Act / Assert
    expect(isWorkerToHostMessage(message)).toBe(false);
  });

  it("treats __proto__ as a store key, not an object setter", async () => {
    // Arrange
    const sandbox = new CodemodeSandbox();
    sandboxes.push(sandbox);
    const store = Object.fromEntries([["__proto__", "before"]]);
    // Act
    const result = await sandbox.execute(
      'const previous = load("__proto__"); store("__proto__", { safe: true }); return previous;',
      { store },
    );
    // Assert
    expect(result).toMatchObject({ ok: true, value: "before" });
    if (!result.ok) {
      throw new Error(result.error.message);
    }
    expect(Object.hasOwn(result.storeWrites.set, "__proto__")).toBe(true);
    expect(Object.getPrototypeOf(result.storeWrites.set)).toBe(Object.prototype);
  });
});
