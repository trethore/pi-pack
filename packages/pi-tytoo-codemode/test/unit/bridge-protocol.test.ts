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

describe("bridge call failures", () => {
  it.each([BridgeMessageType.Call, BridgeMessageType.Global])(
    "cleans up a failed %s send and allows later calls",
    async (type) => {
      // Arrange
      const error = new Error("send failed");
      const bridge = vi.fn<HostBridge>().mockImplementationOnce(() => {
        throw error;
      });
      const rpc = createBridge(bridge);
      const call = rpc.caller(type, "echo");

      // Act
      const failed = call("first");

      // Assert
      await expect(failed).rejects.toBe(error);
      expect(rpc.hasPending()).toBe(false);

      // Act
      const next = call("second");
      rpc.settle(2, true, '"second"');

      // Assert
      expect(bridge).toHaveBeenLastCalledWith(type, 2, "echo", '"second"');
      await expect(next).resolves.toBe("second");
      expect(rpc.hasPending()).toBe(false);
    },
  );

  it("keeps other pending calls when a send fails", async () => {
    // Arrange
    const error = new Error("send failed");
    const bridge = vi
      .fn<HostBridge>()
      .mockImplementationOnce(() => {})
      .mockImplementationOnce(() => {
        throw error;
      });
    const rpc = createBridge(bridge);
    const call = rpc.caller(BridgeMessageType.Call, "echo");
    const first = call("first");

    // Act
    const second = call("second");

    // Assert
    await expect(second).rejects.toBe(error);
    expect(rpc.hasPending()).toBe(true);

    // Act
    rpc.settle(1, true, '"first"');

    // Assert
    await expect(first).resolves.toBe("first");
    expect(rpc.hasPending()).toBe(false);
  });

  it("rejects serialization failures without registering or sending a call", async () => {
    // Arrange
    const error = new Error("serialization failed");
    const value = {
      toJSON() {
        throw error;
      },
    };
    const bridge = vi.fn<HostBridge>();
    const rpc = createBridge(bridge);
    const call = rpc.caller(BridgeMessageType.Call, "echo");

    // Act
    const result = call(value);

    // Assert
    await expect(result).rejects.toBe(error);
    expect(bridge).not.toHaveBeenCalled();
    expect(rpc.hasPending()).toBe(false);
  });
});
