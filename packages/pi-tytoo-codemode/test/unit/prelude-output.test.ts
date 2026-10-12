import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { BridgeMessageType, BridgeOutputType, type HostBridge } from "#src/sandbox/bridge-protocol";
import { MAX_OUTPUT_CHARS, MAX_OUTPUT_ITEMS } from "#src/sandbox/limits";
import { createLifecycle } from "#src/sandbox/prelude/lifecycle";
import { createOutput } from "#src/sandbox/prelude/output";

vi.mock("#src/sandbox/limits", () => ({ MAX_OUTPUT_CHARS: 12, MAX_OUTPUT_ITEMS: 5 }));

function rawJson(source: string): unknown {
  return runInNewContext("JSON.rawJSON(source)", { source });
}

function createHarness() {
  const bridge = vi.fn<HostBridge>();
  const serializeWrites = vi.fn(() => "[]");
  const lifecycle = createLifecycle(bridge, serializeWrites);
  const output = createOutput(bridge, lifecycle);

  return { bridge, lifecycle, output, serializeWrites };
}

describe("prelude output", () => {
  it("keeps console methods distinct and the console object frozen", () => {
    // Arrange
    const { bridge, output } = createHarness();
    const methods = Object.values(output.console);

    // Act
    for (const method of methods) {
      method("x");
    }

    // Assert
    expect(Object.keys(output.console)).toEqual(["log", "info", "warn", "error", "debug"]);
    expect(Object.isFrozen(output.console)).toBe(true);
    expect(new Set(methods).size).toBe(5);
    expect(bridge).toHaveBeenCalledTimes(5);
    for (const call of bridge.mock.calls) {
      expect(call).toEqual([BridgeMessageType.Output, BridgeOutputType.Console, "x", undefined]);
    }
  });

  it("keeps text strict while console formatting can fall back", () => {
    // Arrange
    const { bridge, output } = createHarness();
    const value = {
      toJSON() {
        throw new Error("cannot serialize");
      },
      toString() {
        return "fallback";
      },
    };

    // Act / Assert
    expect(() => output.text(value)).toThrow(new TypeError("cannot serialize"));
    output.console.log(value);
    expect(bridge).toHaveBeenCalledOnce();
    expect(bridge).toHaveBeenCalledWith(BridgeMessageType.Output, BridgeOutputType.Console, "fallback", undefined);
  });

  it("emits image data with its detected MIME type", () => {
    // Arrange
    const { bridge, output } = createHarness();

    // Act
    output.image({ type: "image", data: "iVBORw0KGgo=", mimeType: "image/jpeg" });

    // Assert
    expect(bridge).toHaveBeenCalledWith(BridgeMessageType.Output, BridgeOutputType.Image, "iVBORw0KGgo=", "image/png");
  });

  it("allows the exact character limit and makes overflow terminal", () => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();
    const message = `Script output exceeded ${MAX_OUTPUT_CHARS} characters or ${MAX_OUTPUT_ITEMS} output items (including return). Print a summary. Use a tool to save large data to a file.`;

    // Act
    output.text("123456");
    output.console.log("123456");

    // Assert
    expect(lifecycle.isFinished()).toBe(false);
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(() => output.text("x")).toThrow(new RangeError(message));
    expect(lifecycle.isFinished()).toBe(true);
    expect(bridge).toHaveBeenLastCalledWith(BridgeMessageType.Done, false, expect.any(String), undefined);

    // Act
    output.text("late");
    output.console.log("late");
    output.image("data:image/png;base64,iVBORw0KGgo=");

    // Assert
    expect(bridge).toHaveBeenCalledTimes(3);
  });

  it("counts empty outputs toward the item limit", () => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();

    // Act
    for (let index = 0; index < MAX_OUTPUT_ITEMS; index++) {
      output.text("");
    }

    // Assert
    expect(lifecycle.isFinished()).toBe(false);
    expect(bridge).toHaveBeenCalledTimes(MAX_OUTPUT_ITEMS);
    expect(() => output.text("")).toThrow(RangeError);
    expect(lifecycle.isFinished()).toBe(true);

    // Act
    output.text("");

    // Assert
    expect(bridge).toHaveBeenCalledTimes(MAX_OUTPUT_ITEMS + 1);
    expect(bridge).toHaveBeenLastCalledWith(BridgeMessageType.Done, false, expect.any(String), undefined);
  });
});

describe("returned output limits", () => {
  it.each([
    { label: "exact string limit", value: "x".repeat(12), ok: true },
    { label: "escaped string at the limit", value: "\n".repeat(12), ok: true },
    { label: "oversized string", value: "x".repeat(13), ok: false },
    { label: "exact object limit", value: { value: 12 }, ok: true },
    { label: "oversized object", value: { value: 123 }, ok: false },
    { label: "expanded raw JSON number", value: rawJson("1e12"), ok: false },
    { label: "expanded nested raw JSON number", value: { n: rawJson("1e9") }, ok: false },
  ])("checks $label", async ({ value, ok }) => {
    // Arrange
    const { bridge, lifecycle, serializeWrites } = createHarness();

    // Act
    lifecycle.run(() => Promise.resolve(value));
    await Promise.resolve();

    // Assert
    expect(lifecycle.isFinished()).toBe(true);
    expect(bridge).toHaveBeenCalledOnce();
    expect(bridge).toHaveBeenCalledWith(
      BridgeMessageType.Done,
      ok,
      ok ? JSON.stringify(value) : expect.stringContaining("output exceeded"),
      ok ? "[]" : undefined,
    );
    expect(serializeWrites).toHaveBeenCalledTimes(ok ? 1 : 0);
  });

  it.each([
    { label: "text at the limit", prior: "text", value: "123456", ok: true },
    { label: "text overflow", prior: "text", value: "1234567", ok: false },
    { label: "console overflow", prior: "console", value: "1234567", ok: false },
    { label: "image overflow", prior: "image", value: "x", ok: false },
  ])("shares the character budget with $label", async ({ prior, value, ok }) => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();
    if (prior === "image") {
      output.image("data:image/png;base64,iVBORw0KGgo=");
    } else if (prior === "console") {
      output.console.log("123456");
    } else {
      output.text("123456");
    }

    // Act
    lifecycle.run(() => Promise.resolve(value));
    await Promise.resolve();

    // Assert
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(bridge.mock.calls.at(-1)?.slice(0, 2)).toEqual([BridgeMessageType.Done, ok]);
  });

  it.each([MAX_OUTPUT_ITEMS - 1, MAX_OUTPUT_ITEMS])("counts an empty return after %s items", async (items) => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();
    for (let index = 0; index < items; index++) {
      output.text("");
    }

    // Act
    lifecycle.run(() => Promise.resolve(""));
    await Promise.resolve();

    // Assert
    expect(bridge.mock.calls.at(-1)?.slice(0, 2)).toEqual([BridgeMessageType.Done, items < MAX_OUTPUT_ITEMS]);
  });

  it.each([undefined, () => undefined, Symbol("ignored")])("does not count an omitted return: %s", async (value) => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();
    for (let index = 0; index < MAX_OUTPUT_ITEMS; index++) {
      output.text("");
    }

    // Act
    lifecycle.run(() => Promise.resolve(value));
    await Promise.resolve();

    // Assert
    expect(bridge).toHaveBeenLastCalledWith(BridgeMessageType.Done, true, undefined, "[]");
  });

  it.each([NaN, Infinity, -Infinity])("preserves JSON serialization for %s", async (value) => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();
    output.text("x".repeat(MAX_OUTPUT_CHARS - 4));

    // Act
    lifecycle.run(() => Promise.resolve(value));
    await Promise.resolve();

    // Assert
    expect(bridge).toHaveBeenLastCalledWith(BridgeMessageType.Done, true, "null", "[]");
  });

  it("serializes a returned object once and counts output emitted during serialization", async () => {
    // Arrange
    const { bridge, lifecycle, output } = createHarness();
    const toJSON = vi.fn(() => {
      output.text("123456");
      return "1234567";
    });

    // Act
    lifecycle.run(() => Promise.resolve({ toJSON }));
    await Promise.resolve();

    // Assert
    expect(toJSON).toHaveBeenCalledOnce();
    expect(bridge).toHaveBeenCalledTimes(2);
    expect(bridge).toHaveBeenLastCalledWith(BridgeMessageType.Done, false, expect.any(String), undefined);
  });
});

it("normalizes raw JSON before sending a returned value to the host", async () => {
  // Arrange
  const bridge = vi.fn<HostBridge>();
  const lifecycle = createLifecycle(bridge, () => "[]");
  const value = rawJson(`1${"0".repeat(1000)}`);

  // Act
  lifecycle.run(() => Promise.resolve(value));
  await Promise.resolve();

  // Assert
  expect(bridge).toHaveBeenCalledOnce();
  expect(bridge).toHaveBeenCalledWith(BridgeMessageType.Done, true, "null", "[]");
});
