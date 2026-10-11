import { describe, expect, it, vi } from "vitest";
import { BridgeMessageType, BridgeOutputType, type HostBridge } from "#src/sandbox/bridge-protocol";
import { MAX_OUTPUT_CHARS, MAX_OUTPUT_ITEMS } from "#src/sandbox/limits";
import { createLifecycle } from "#src/sandbox/prelude/lifecycle";
import { createOutput } from "#src/sandbox/prelude/output";

vi.mock("#src/sandbox/limits", () => ({ MAX_OUTPUT_CHARS: 12, MAX_OUTPUT_ITEMS: 5 }));

function createHarness() {
  const bridge = vi.fn<HostBridge>();
  const lifecycle = createLifecycle(bridge, () => "[]");
  const output = createOutput(bridge, lifecycle);

  return { bridge, lifecycle, output };
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
    const message = `script output exceeded the limit of ${MAX_OUTPUT_CHARS} characters or ${MAX_OUTPUT_ITEMS} text(), image(), and console calls. Print a summary instead, or write large data to a file with a tool.`;

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
