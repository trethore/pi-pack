import { describe, expect, it, vi } from "vitest";
import { BridgeMessageType, isBridgeMessageType, type HostBridge } from "#src/sandbox/bridge-protocol";
import { createBridge } from "#src/sandbox/prelude/bridge";

describe("bridge message types", () => {
  it.each(["call", "global", "output", "done"])("accepts the wire type %s", (type) => {
    // Act / Assert
    expect(isBridgeMessageType(type)).toBe(true);
  });

  it.each([undefined, null, 1, "", "tool", "result", "Call", {}])("rejects unknown types: %j", (type) => {
    // Act / Assert
    expect(isBridgeMessageType(type)).toBe(false);
  });

  it.each([
    { type: BridgeMessageType.Call, wireType: "call" },
    { type: BridgeMessageType.Global, wireType: "global" },
  ])("preserves the $wireType call format and settles the result", async ({ type, wireType }) => {
    // Arrange
    const bridge = vi.fn<HostBridge>();
    const rpc = createBridge(bridge);
    const call = rpc.caller(type, "echo");

    // Act
    const result = call({ value: 42 });
    rpc.settle(1, true, '{"value":42}');

    // Assert
    expect(bridge).toHaveBeenCalledWith(wireType, 1, "echo", '{"value":42}');
    await expect(result).resolves.toEqual({ value: 42 });
    expect(rpc.hasPending()).toBe(false);
  });
});
