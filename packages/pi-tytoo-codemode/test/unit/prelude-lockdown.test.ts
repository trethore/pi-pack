import { afterEach, describe, expect, it } from "vitest";
import { CodemodeSandbox } from "#src/sandbox/sandbox";

const sandboxes: CodemodeSandbox[] = [];

afterEach(async () => {
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

describe("QuickJS lockdown", () => {
  it("allows array and function receivers to override inherited properties", async () => {
    // Arrange
    const sandbox = new CodemodeSandbox();
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute(`
      const { set } = Object.getOwnPropertyDescriptor(Object.prototype, "toString");
      const array = [];
      const fn = function () {};
      set.call(array, () => "array override");
      set.call(fn, () => "function override");
      return [String(array), String(fn), Object.isFrozen(Object.prototype)];
    `);

    // Assert
    expect(result).toMatchObject({ ok: true, value: ["array override", "function override", true] });
  });

  it("ignores primitive receivers without changing the frozen prototype", async () => {
    // Arrange
    const sandbox = new CodemodeSandbox();
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute(`
      const original = Object.prototype.toString;
      const { set } = Object.getOwnPropertyDescriptor(Object.prototype, "toString");
      for (const receiver of [null, undefined, 0, "text", true, 1n, Symbol("value")]) {
        set.call(receiver, () => "ignored");
      }
      return Object.prototype.toString === original;
    `);

    // Assert
    expect(result).toMatchObject({ ok: true, value: true });
  });

  it("freezes override accessors but leaves globalThis extensible", async () => {
    // Arrange
    const sandbox = new CodemodeSandbox();
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute(`
      const descriptor = Object.getOwnPropertyDescriptor(Object.prototype, "toString");
      globalThis.customValue = 42;
      return {
        getterFrozen: Object.isFrozen(descriptor.get),
        setterFrozen: Object.isFrozen(descriptor.set),
        configurable: descriptor.configurable,
        globalExtensible: Object.isExtensible(globalThis),
        customValue: globalThis.customValue,
      };
    `);

    // Assert
    expect(result).toMatchObject({
      ok: true,
      value: {
        getterFrozen: true,
        setterFrozen: true,
        configurable: false,
        globalExtensible: true,
        customValue: 42,
      },
    });
  });
});
