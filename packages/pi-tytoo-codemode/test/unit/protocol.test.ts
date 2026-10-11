import { isGlobalDefinitions, isStoreSnapshot, isToolDefinitions } from "#src/sandbox/bootstrap";
import { describe, expect, it } from "vitest";
import { isHostToWorkerMessage, isWorkerToHostMessage, isWorkerData, type WorkerData } from "#src/sandbox/protocol";
import { DEFAULT_MEMORY_LIMIT_BYTES, MAX_MEMORY_LIMIT_BYTES } from "#src/sandbox/limits";
import { loadQuickJSWasm } from "#src/sandbox/wasm-loader";

describe("worker-to-host messages", () => {
  it.each([
    { type: "call", id: 1, target: "tool", name: "read", args: "{}" },
    { type: "call", id: 2, target: "global", name: "helper", args: undefined },
    { type: "output", item: { type: "text", text: "hello" } },
    { type: "output", item: { type: "text", text: "hello", console: true } },
    { type: "output", item: { type: "image", data: "AA==", mimeType: "image/png" } },
    { type: "done", ok: true, value: "1", writes: "[]" },
    { type: "done", ok: true, value: undefined, writes: "[]" },
    { type: "done", ok: false, error: '{"message":"failed"}' },
    { type: "crash", message: "failed" },
  ])("accepts supported wire messages: %j", (message) => {
    // Act / Assert
    expect(isWorkerToHostMessage(message)).toBe(true);
  });

  it.each([
    null,
    [],
    { type: "unknown" },
    { type: "call", id: 1, target: "other", name: "read" },
    { type: "call", id: 1, target: "tool", name: "read", args: null },
    { type: "output", item: { type: "text", text: "hello", console: false } },
    { type: "output", item: { type: "image", data: "AA==" } },
    { type: "done", ok: false, error: {} },
    { type: "done", ok: true, value: 1, writes: "[]" },
    { type: "crash", message: 42 },
  ])("rejects malformed messages: %j", (message) => {
    // Act / Assert
    expect(isWorkerToHostMessage(message)).toBe(false);
  });
});

describe("host-to-worker messages", () => {
  it.each([
    { type: "result", id: 1, ok: true, payload: "{}" },
    { type: "result", id: 1, ok: true, payload: undefined },
    { type: "result", id: 1, ok: false, payload: "failed" },
  ])("accepts result messages: %j", (message) => {
    // Act / Assert
    expect(isHostToWorkerMessage(message)).toBe(true);
  });

  it.each([
    null,
    { type: "unknown", id: 1, ok: true },
    { type: "result", id: "1", ok: true },
    { type: "result", id: 1, ok: "true" },
    { type: "result", id: 1, ok: true, payload: null },
  ])("rejects malformed results: %j", (message) => {
    // Act / Assert
    expect(isHostToWorkerMessage(message)).toBe(false);
  });
});

describe("worker data collections", () => {
  it.each([
    { name: "tools", validate: isToolDefinitions, valid: [{ name: "read", jsName: "read", description: "Read" }] },
    { name: "globals", validate: isGlobalDefinitions, valid: [{ name: "helper", spread: false }] },
  ])("validates $name definitions", ({ validate, valid }) => {
    // Arrange
    const holes: unknown[] = [];
    holes.length = 2;
    const sparse: unknown[] = [valid[0]];
    sparse.length = 2;
    const inherited: unknown[] = [];
    inherited.length = 1;
    Object.setPrototypeOf(inherited, { 0: valid[0] });

    // Act / Assert
    expect(validate(valid)).toBe(true);
    expect(validate([])).toBe(true);
    expect(validate(null)).toBe(false);
    expect(validate({})).toBe(false);
    expect(validate([null])).toBe(false);
    expect(validate([{}])).toBe(false);
    expect(validate(holes)).toBe(false);
    expect(validate(sparse)).toBe(false);
    expect(validate(inherited)).toBe(false);
    expect(validate([{ name: 42, jsName: 42, description: 42, spread: "false" }])).toBe(false);
  });

  it("accepts only string-valued store snapshots", () => {
    // Act / Assert
    expect(isStoreSnapshot({ key: "null" })).toBe(true);
    expect(isStoreSnapshot({})).toBe(true);
    expect(isStoreSnapshot({ key: null })).toBe(false);
    expect(isStoreSnapshot([])).toBe(false);
  });
});

async function createWorkerData(): Promise<WorkerData> {
  return {
    code: "return 1;",
    tools: [],
    globals: [],
    wasm: await loadQuickJSWasm(),
    memoryLimitBytes: DEFAULT_MEMORY_LIMIT_BYTES,
    store: {},
    interrupt: new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT),
  };
}

describe("worker bootstrap validation", () => {
  it("accepts a compiled module after structured cloning", async () => {
    // Arrange
    const data = await createWorkerData();

    // Act
    const cloned = structuredClone(data);

    // Assert
    expect(isWorkerData(cloned)).toBe(true);
  });

  it.each([{}, new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]), null, undefined])(
    "rejects uncompiled WASM input: %j",
    async (wasm) => {
      // Arrange
      const data = await createWorkerData();

      // Act / Assert
      expect(isWorkerData({ ...data, wasm })).toBe(false);
    },
  );

  it.each([1, DEFAULT_MEMORY_LIMIT_BYTES, MAX_MEMORY_LIMIT_BYTES])(
    "accepts a memory limit of %s bytes",
    async (memoryLimitBytes) => {
      // Arrange
      const data = await createWorkerData();

      // Act / Assert
      expect(isWorkerData({ ...data, memoryLimitBytes })).toBe(true);
    },
  );

  it.each([undefined, null, "256", 0, -1, 1.5, NaN, Infinity, -Infinity, MAX_MEMORY_LIMIT_BYTES + 1])(
    "rejects an invalid or unresolved memory limit: %s",
    async (memoryLimitBytes) => {
      // Arrange
      const data = await createWorkerData();

      // Act / Assert
      expect(isWorkerData({ ...data, memoryLimitBytes })).toBe(false);
    },
  );
});
