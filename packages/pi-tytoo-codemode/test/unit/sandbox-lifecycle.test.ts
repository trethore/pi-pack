import { setImmediate } from "node:timers/promises";
import { Worker } from "node:worker_threads";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodemodeSandbox } from "#src/sandbox/sandbox";

const sandboxes: CodemodeSandbox[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(sandboxes.splice(0).map((sandbox) => sandbox.close()));
});

describe("sandbox startup failures", () => {
  it("settles when preparing worker data throws", async () => {
    // Arrange
    const execute = vi.fn();
    const sandbox = new CodemodeSandbox({
      timeoutMs: 1_000,
      tools: [
        {
          name: "broken",
          get description(): string {
            throw new Error("description failed");
          },
          execute,
        },
      ],
    });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute("return 1;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sandbox", message: "Failed to start worker: description failed" },
    });
    expect(execute).not.toHaveBeenCalled();
  });

  it("terminates the worker when registering listeners throws", async () => {
    // Arrange
    const addListener = Worker.prototype.on;
    const terminate = vi.spyOn(Worker.prototype, "terminate");
    vi.spyOn(Worker.prototype, "on").mockImplementation(function (this: Worker, event, listener) {
      if (event === "message") {
        throw new Error("listener failed");
      }

      return addListener.call(this, event, listener);
    });
    const sandbox = new CodemodeSandbox({ timeoutMs: 1_000 });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute("return 1;");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sandbox", message: "Failed to start worker: listener failed" },
    });
    expect(terminate).toHaveBeenCalledOnce();
  });
});

describe("sandbox call completion", () => {
  it("settles when posting a tool reply throws", async () => {
    // Arrange
    vi.spyOn(Worker.prototype, "postMessage").mockImplementation(() => {
      throw new Error("reply failed");
    });
    const sandbox = new CodemodeSandbox({
      timeoutMs: 1_000,
      tools: [{ name: "echo", execute: (args) => args }],
    });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute('return await tools.echo("hello");');

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sandbox", message: "Sandbox host failed: reply failed" },
      calls: [{ name: "echo", status: "ok" }],
    });
  });

  it.each(["resolve", "reject"])("ignores calls that %s after cancellation", async (outcome) => {
    // Arrange
    const called = Promise.withResolvers<void>();
    const completed = Promise.withResolvers<string>();
    const controller = new AbortController();
    const postMessage = vi.spyOn(Worker.prototype, "postMessage");
    const sandbox = new CodemodeSandbox({
      tools: [
        {
          name: "wait",
          execute() {
            called.resolve();
            return completed.promise;
          },
        },
      ],
    });
    sandboxes.push(sandbox);
    const execution = sandbox.execute("return await tools.wait();", { signal: controller.signal });
    await called.promise;

    // Act
    controller.abort();
    const result = await execution;
    const callsAtCancellation = structuredClone(result.calls);

    if (outcome === "resolve") {
      completed.resolve("late");
    } else {
      completed.reject(new Error("late"));
    }

    await setImmediate();

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "aborted" },
      calls: [{ name: "wait", status: "cancelled" }],
    });
    expect(result.calls).toEqual(callsAtCancellation);
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("rejects duplicate pending call IDs before accepting a done message", async () => {
    // Arrange
    const source = `
      import { parentPort } from "node:worker_threads";
      const call = { type: "call", id: 1, target: "tool", name: "wait" };
      parentPort.postMessage(call);
      parentPort.postMessage(call);
      parentPort.postMessage({ type: "done", ok: true, value: "1", writes: "[]" });
    `;
    const execute = vi.fn(() => new Promise(() => {}));
    const sandbox = new CodemodeSandbox({
      workerUrl: new URL(`data:text/javascript,${encodeURIComponent(source)}`),
      tools: [{ name: "wait", execute }],
    });
    sandboxes.push(sandbox);

    // Act
    const result = await sandbox.execute("");

    // Assert
    expect(result).toMatchObject({
      ok: false,
      error: { kind: "sandbox" },
      calls: [{ name: "wait", status: "cancelled" }],
    });
    expect(result).toHaveProperty("error.message", expect.stringContaining("duplicate call id 1"));
    expect(execute).toHaveBeenCalledOnce();
  });
});
