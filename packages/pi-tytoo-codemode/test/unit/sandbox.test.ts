import { afterEach, describe, expect, it } from "vitest";
import { CodemodeSandbox } from "#src/sandbox/sandbox";
import { isWorkerToHostMessage } from "#src/sandbox/protocol";
import { MAX_MEMORY_LIMIT_BYTES } from "#src/sandbox/limits";

const sandboxes: CodemodeSandbox[] = [];
afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

describe("sandbox boundaries", () => {
  it("rejects an uncompiled module in the real worker", async () => {
    // Arrange
    const sandbox = new CodemodeSandbox({ wasm: {} });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute("return 1;");

    // Assert
    expect(result).toMatchObject({ ok: false, error: { kind: "sandbox", message: "Invalid sandbox worker data" } });
  });

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

describe("sandbox memory limits", () => {
  it.each([0, -1, 1.5, NaN, Infinity, -Infinity, MAX_MEMORY_LIMIT_BYTES + 1, null, "256", true])(
    "rejects invalid memory limits before starting a worker: %s",
    (memoryLimitBytes) => {
      // Act / Assert
      expect(() => new CodemodeSandbox({ memoryLimitBytes: memoryLimitBytes as number })).toThrow(RangeError);
    },
  );

  it.each([
    { options: {}, expected: 256 * 1024 * 1024 },
    { options: { memoryLimitBytes: 1 }, expected: 1 },
    { options: { memoryLimitBytes: 16 * 1024 * 1024 }, expected: 16 * 1024 * 1024 },
    { options: { memoryLimitBytes: 1024 * 1024 * 1024 }, expected: 1024 * 1024 * 1024 },
  ])("passes the resolved limit of $expected bytes to the worker", async ({ options, expected }) => {
    // Arrange
    const source = `
      import { parentPort, workerData } from "node:worker_threads";
      parentPort.postMessage({
        type: "done",
        ok: true,
        value: JSON.stringify(workerData.memoryLimitBytes),
        writes: "[]",
      });
    `;
    const sandbox = new CodemodeSandbox({
      ...options,
      workerUrl: new URL(`data:text/javascript,${encodeURIComponent(source)}`),
    });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute("");

    // Assert
    expect(result).toMatchObject({ ok: true, value: expected });
  });

  it("enforces the configured limit inside QuickJS", async () => {
    // Arrange
    const sandbox = new CodemodeSandbox({ memoryLimitBytes: 8 * 1024 * 1024 });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute('return "x".repeat(32 * 1024 * 1024).length;');

    // Assert
    expect(result).toMatchObject({ ok: false, error: { name: "InternalError", message: "out of memory" } });
  });
});
