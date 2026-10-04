import { createPiMethodPatch, createPiPatch } from "@pi-pack/shared/unsafe";
import { beforeEach, describe, expect, it, vi } from "vitest";

const host = vi.hoisted(() => ({ version: "1.0.0" }));
vi.mock("@earendil-works/pi-coding-agent", () => ({
  get VERSION() {
    return host.version;
  },
}));

beforeEach(() => {
  host.version = "1.0.0";
});

function fixture() {
  const restore = vi.fn();
  const apply = vi.fn(() => restore);
  const warn = vi.fn();
  const patch = createPiPatch({ id: "test-patch", testedPiVersion: "1.0.0", apply });
  return { patch, apply, restore, warn };
}

describe("createPiPatch", () => {
  it("applies lazily, shares concurrent leases, and restores only after the last release", () => {
    // Arrange
    const { patch, apply, restore, warn } = fixture();
    expect(apply).not.toHaveBeenCalled();

    // Act
    const first = patch.acquire(warn);
    const second = patch.acquire(warn);
    first();
    first();

    // Assert
    expect(apply).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    second();
    second();
    expect(restore).toHaveBeenCalledOnce();
    patch.acquire(warn)();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledTimes(2);
  });

  it.each(["0.9.0", "1.0.1", "2.0.0", "1.0.0-beta.1", "1.0.0+custom"])(
    "warns once but still applies on a different host version: %s",
    (version) => {
      // Arrange
      host.version = version;
      const { patch, apply, restore, warn } = fixture();

      // Act
      patch.acquire(warn)();
      patch.acquire(warn)();

      // Assert
      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        `Unsafe Pi patch "test-patch" was tested with Pi 1.0.0, but the running version is ${version}. Applying it anyway; compatibility is unverified.`,
      );
      expect(warn.mock.invocationCallOrder[0]).toBeLessThan(apply.mock.invocationCallOrder[0]!);
      expect(apply).toHaveBeenCalledTimes(2);
      expect(restore).toHaveBeenCalledTimes(2);
    },
  );

  it.each([undefined, null, "", "*", "^1.0.0", "~1.0.0", ">=1.0.0", "1.0", "1.0.x"])(
    "rejects a missing or nonexact tested version: %j",
    (version) => {
      // Arrange
      const apply = vi.fn();

      // Act / Assert
      expect(() => createPiPatch({ id: "invalid", testedPiVersion: version as string, apply })).toThrow(
        "must declare an exact testedPiVersion",
      );
      expect(apply).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, "", "   "])("requires a patch ID: %j", (id) => {
    // Act / Assert
    expect(() => createPiPatch({ id: id as string, testedPiVersion: "1.0.0", apply: vi.fn() })).toThrow(
      "must declare an ID",
    );
  });

  it("does not retain a lease when installation fails", () => {
    // Arrange
    const { patch, apply, restore, warn } = fixture();
    apply.mockImplementationOnce(() => {
      throw new Error("unsupported target");
    });

    // Act / Assert
    expect(() => patch.acquire(warn)).toThrow("unsupported target");
    expect(restore).not.toHaveBeenCalled();
    patch.acquire(warn)();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledOnce();
  });

  it("does not apply silently when the warning reporter fails", () => {
    // Arrange
    host.version = "2.0.0";
    const { patch, apply, warn } = fixture();
    warn.mockImplementationOnce(() => {
      throw new Error("cannot show warning");
    });

    // Act / Assert
    expect(() => patch.acquire(warn)).toThrow("cannot show warning");
    expect(apply).not.toHaveBeenCalled();
    patch.acquire(warn)();
    expect(warn).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledOnce();
  });

  it("reports cleanup failures without retaining a stale lease", () => {
    // Arrange
    const { patch, apply, restore, warn } = fixture();
    restore.mockImplementationOnce(() => {
      throw new Error("cleanup failed");
    });
    const release = patch.acquire(warn);

    // Act / Assert
    expect(release).toThrow("cleanup failed");
    expect(release).not.toThrow();
    patch.acquire(warn)();
    expect(apply).toHaveBeenCalledTimes(2);
    expect(restore).toHaveBeenCalledTimes(2);
  });
});

function greetingPatch(target: { greet(): string }, suffix: string) {
  return createPiMethodPatch({
    id: `greeting/${suffix}`,
    testedPiVersion: "1.0.0",
    target,
    key: "greet",
    wrap(original) {
      return function (this: typeof target) {
        return original.call(this) + suffix;
      };
    },
  });
}

describe("createPiMethodPatch", () => {
  it("preserves arguments, receivers, and property descriptors", () => {
    // Arrange
    const target = {
      factor: 3,
      multiply(value: number) {
        return this.factor * value;
      },
    };
    Object.defineProperty(target, "multiply", { enumerable: false });
    const descriptor = Object.getOwnPropertyDescriptor(target, "multiply");
    const patch = createPiMethodPatch({
      id: "multiply",
      testedPiVersion: "1.0.0",
      target,
      key: "multiply",
      wrap(original) {
        return function (this: typeof target, value: number) {
          return original.call(this, value) + 1;
        };
      },
    });

    // Act
    const release = patch.acquire(vi.fn());

    // Assert
    expect(target.multiply(4)).toBe(13);
    expect(target.multiply.call({ factor: 5, multiply: target.multiply }, 4)).toBe(21);
    expect(Object.getOwnPropertyDescriptor(target, "multiply")).toMatchObject({
      enumerable: false,
      configurable: true,
      writable: true,
    });
    release();
    expect(Object.getOwnPropertyDescriptor(target, "multiply")).toEqual(descriptor);
    expect(target.multiply(4)).toBe(12);
  });

  it.each([undefined, 42, "not a function"])("checks the method at acquisition time: %j", (value) => {
    // Arrange
    const target = { greet: () => "hello" };
    const original = target.greet;
    const patch = greetingPatch(target, "!");
    Reflect.set(target, "greet", value);

    // Act / Assert
    expect(() => patch.acquire(vi.fn())).toThrow("greet must be an own data method");
    expect(target.greet).toBe(value);
    target.greet = original;
    const release = patch.acquire(vi.fn());
    expect(target.greet()).toBe("hello!");
    release();
    expect(target.greet).toBe(original);
  });

  it("rejects accessors without invoking their getters", () => {
    // Arrange
    const target = { greet: () => "hello" };
    const get = vi.fn(() => target.greet);
    Object.defineProperty(target, "greet", { get });
    const patch = greetingPatch(target, "!");

    // Act / Assert
    expect(() => patch.acquire(vi.fn())).toThrow("must be an own data method");
    expect(get).not.toHaveBeenCalled();
  });

  it("does not shadow inherited methods", () => {
    // Arrange
    class Target {
      greet() {
        return "hello";
      }
    }
    const target = new Target();
    const patch = greetingPatch(target, "!");

    // Act / Assert
    expect(() => patch.acquire(vi.fn())).toThrow("must be an own data method");
    expect(Object.hasOwn(target, "greet")).toBe(false);
    expect(target.greet()).toBe("hello");
  });

  it("fails on an immutable target without poisoning later acquisitions", () => {
    // Arrange
    const target = Object.freeze({ greet: () => "hello" });
    const original = target.greet;
    const patch = greetingPatch(target, "!");

    // Act / Assert
    expect(() => patch.acquire(vi.fn())).toThrow(TypeError);
    expect(() => patch.acquire(vi.fn())).toThrow(TypeError);
    expect(target.greet).toBe(original);
  });

  it("leaves the target unchanged when the wrapper factory fails", () => {
    // Arrange
    const target = { greet: () => "hello" };
    const original = target.greet;
    const patch = createPiMethodPatch({
      id: "failing-wrapper",
      testedPiVersion: "1.0.0",
      target,
      key: "greet",
      wrap() {
        throw new Error("factory failed");
      },
    });

    // Act / Assert
    expect(() => patch.acquire(vi.fn())).toThrow("factory failed");
    expect(target.greet).toBe(original);
  });

  it("rejects a nonfunction replacement without changing the target", () => {
    // Arrange
    const target = { greet: () => "hello" };
    const original = target.greet;
    const patch = createPiMethodPatch({
      id: "invalid-wrapper",
      testedPiVersion: "1.0.0",
      target,
      key: "greet",
      wrap: () => 42 as unknown as typeof original,
    });

    // Act / Assert
    expect(() => patch.acquire(vi.fn())).toThrow("replacement must be a method");
    expect(target.greet).toBe(original);
  });

  it("does not overwrite a later external patch and disables its retained wrapper", () => {
    // Arrange
    const target = { greet: () => "hello" };
    const release = greetingPatch(target, "!").acquire(vi.fn());
    const retained = target.greet;
    const external = () => retained() + "?";
    target.greet = external;

    // Act
    release();

    // Assert
    expect(target.greet).toBe(external);
    expect(target.greet()).toBe("hello?");
  });

  it.each(["inner", "outer"])("restores layered patches when the %s lease ends first", (first) => {
    // Arrange
    const target = { greet: () => "hello" };
    const original = target.greet;
    const inner = greetingPatch(target, "!").acquire(vi.fn());
    const outer = greetingPatch(target, "?").acquire(vi.fn());
    expect(target.greet()).toBe("hello!?");

    // Act / Assert
    if (first === "inner") {
      inner();
      expect(target.greet()).toBe("hello?");
      outer();
    } else {
      outer();
      expect(target.greet()).toBe("hello!");
      inner();
    }
    expect(target.greet).toBe(original);
  });
});
