import { Worker } from "node:worker_threads";
import { expect, it } from "vitest";
import { DEFAULT_MEMORY_LIMIT_BYTES } from "#src/sandbox/limits";
import {
  isWorkerToHostMessage,
  type HostToWorkerMessage,
  type WorkerData,
  type WorkerToHostMessage,
} from "#src/sandbox/protocol";
import { loadQuickJSWasm } from "#src/sandbox/wasm-loader";

it.each([
  { name: "initial execution", prefix: "", loop: "while (true) await null;" },
  { name: "tool result delivery", prefix: "await tools.resume();", loop: "while (true) await null;" },
  { name: "script error handlers", prefix: "", loop: "while (true) { try { await null; } catch {} }" },
])("polls the shared interrupt flag during promise jobs after $name", async ({ prefix, loop }) => {
  // Arrange
  const interrupt = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  const data: WorkerData = {
    code: `${prefix} text("ready"); ${loop}`,
    tools: [{ name: "resume", description: "Resume execution" }],
    globals: [],
    store: {},
    wasm: await loadQuickJSWasm(),
    memoryLimitBytes: DEFAULT_MEMORY_LIMIT_BYTES,
    interrupt,
  };
  const worker = new Worker(new URL("../../dist/sandbox/worker.js", import.meta.url), { workerData: data });
  const { promise, resolve, reject } = Promise.withResolvers<WorkerToHostMessage>();
  const deadline = setTimeout(() => reject(new Error("Worker did not observe the shared interrupt flag")), 2000);
  worker.on("error", reject);
  worker.on("exit", (code) => reject(new Error(`Worker exited before reporting interruption: ${code}`)));
  worker.on("message", (message: unknown) => {
    if (!isWorkerToHostMessage(message)) {
      reject(new Error("Invalid worker message"));
      return;
    }
    if (message.type === "call") {
      const reply: HostToWorkerMessage = { type: "result", id: message.id, ok: true, payload: undefined };
      // Node worker messages do not have a browser targetOrigin.
      // oxlint-disable-next-line unicorn/require-post-message-target-origin
      worker.postMessage(reply);
    } else if (message.type === "output") {
      Atomics.store(new Int32Array(interrupt), 0, 1);
    } else {
      resolve(message);
    }
  });

  try {
    // Act
    const result = await promise;

    // Assert
    expect(result.type).toBe("crash");
    if (result.type === "crash") {
      expect(result.message).toMatch(/^Error: (Execution interrupted|Promise job failed)$/);
    }
  } finally {
    clearTimeout(deadline);
    // Only terminate after the assertion: forced termination must not make this regression pass.
    await worker.terminate();
  }
});
