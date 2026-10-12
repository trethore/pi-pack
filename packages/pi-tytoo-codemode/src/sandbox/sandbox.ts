import { isRecord, isArray, encodeJson } from "#src/sandbox/values";
import { Worker } from "node:worker_threads";
import {
  CodemodeErrorKind,
  type CodemodeCall,
  type CodemodeError,
  type CodemodeExecuteOptions,
  type CodemodeOutputItem,
  type CodemodeResult,
  type CodemodeSandboxOptions,
  type CodemodeStoreWrites,
  type CodemodeTool,
} from "#src/sandbox/types";
import type { CodemodeWasmModule } from "#src/sandbox/wasm";
import { loadQuickJSWasm } from "#src/sandbox/wasm-loader";
import {
  HostToWorkerMessageType,
  WorkerToHostMessageType,
  type HostToWorkerMessage,
  isWorkerToHostMessage,
  type WorkerData,
  type WorkerToHostMessage,
} from "#src/sandbox/protocol";
import { DEFAULT_MEMORY_LIMIT_BYTES, MAX_MEMORY_LIMIT_BYTES, isMemoryLimitBytes } from "#src/sandbox/limits";
import { WorkerEvents } from "#src/sandbox/worker-events";

const DEFAULT_TIMEOUT_MS = 300_000;

const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
const RESERVED_GLOBALS: ReadonlySet<string> = new Set([
  "tools",
  "ALL_TOOLS",
  "console",
  "text",
  "image",
  "exit",
  "globalThis",
  "store",
  "load",
]);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function serializeStore(store: Readonly<Record<string, unknown>> | undefined): Record<string, string> {
  const serialized: Record<string, string> = {};

  for (const [key, value] of Object.entries(store ?? {})) {
    const json = encodeJson(value);
    if (json !== undefined) {
      Object.defineProperty(serialized, key, { value: json, enumerable: true, writable: true, configurable: true });
    }
  }

  return serialized;
}

/**
 * The prelude that serializes values for the host runs in the same VM as the script, so a script
 * that patches built-ins (for example `Array.prototype.toJSON`) can make it send malformed data.
 * Payloads that do not decode throw this error, and the execution fails as a sandbox error.
 */
class BridgeError extends Error {}

function parseBridgeJson(json: string, what: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    throw new BridgeError(`${what} is not valid JSON`);
  }
}

function parseStoreWrites(json: string): CodemodeStoreWrites {
  const entries = parseBridgeJson(json, "store writes");
  if (!isArray(entries)) {
    throw new BridgeError("store writes are not an array");
  }

  const writes: CodemodeStoreWrites = { set: {}, delete: [] };

  for (const entry of entries) {
    if (!isStoreWrite(entry)) {
      throw new BridgeError("store writes contain a malformed entry");
    }

    const [key, value] = entry;
    if (value === undefined) {
      writes.delete.push(key);
    } else {
      Object.defineProperty(writes.set, key, {
        value: parseBridgeJson(value, `store value for ${JSON.stringify(key)}`),
        enumerable: true,
        writable: true,
        configurable: true,
      });
    }
  }

  return writes;
}

function parseScriptError(json: string): CodemodeError {
  const parsed = parseBridgeJson(json, "script error");
  if (!isRecord(parsed)) {
    throw new BridgeError("script error is not an object");
  }

  const { name, message, stack } = parsed;
  if (
    typeof message !== "string" ||
    (name !== undefined && typeof name !== "string") ||
    (stack !== undefined && typeof stack !== "string")
  ) {
    throw new BridgeError("script error is malformed");
  }

  return {
    kind: CodemodeErrorKind.Script,
    message,
    ...(name === undefined ? {} : { name }),
    ...(stack === undefined ? {} : { stack }),
  };
}

function defaultWorkerUrl(): URL {
  // Workers do not inherit Pi's TypeScript extension loader.
  return new URL("../../dist/sandbox/worker.js", import.meta.url);
}

type CallMessage = Extract<WorkerToHostMessage, { type: typeof WorkerToHostMessageType.Call }>;
type DoneMessage = Extract<WorkerToHostMessage, { type: typeof WorkerToHostMessageType.Done }>;

interface PendingCall {
  record: CodemodeCall | undefined;
  startedAt: number;
  controller: AbortController;
}

interface ExecutionOptions {
  code: string;
  tools: ReadonlyMap<string, CodemodeTool>;
  globals: ReadonlyMap<string, CodemodeTool>;
  timeoutMs: number;
  signal: AbortSignal | undefined;
  memoryLimitBytes: number;
  store: Record<string, string>;
  wasm: Promise<CodemodeWasmModule>;
  workerUrl: string | URL;
}

/**
 * One script run in its own worker and QuickJS VM. A fresh worker per run keeps
 * termination simple: a runaway script, including one that only spins the
 * microtask queue, is killed with `terminate()` and cannot poison a later run.
 */
class Execution {
  readonly promise: Promise<CodemodeResult>;
  private readonly resolveResult: (result: CodemodeResult) => void;
  private worker: Worker | undefined;
  private readonly interrupt = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT);
  private readonly tools: ReadonlyMap<string, CodemodeTool>;
  private readonly globals: ReadonlyMap<string, CodemodeTool>;
  private readonly signal: AbortSignal | undefined;
  private readonly timer: NodeJS.Timeout | undefined;
  private readonly output: CodemodeOutputItem[] = [];
  private readonly calls: CodemodeCall[] = [];
  private readonly pending = new Map<number, PendingCall>();
  private finished = false;

  constructor(options: ExecutionOptions) {
    const { promise, resolve } = Promise.withResolvers<CodemodeResult>();
    this.promise = promise;
    this.resolveResult = resolve;

    this.tools = options.tools;
    this.globals = options.globals;
    this.signal = options.signal;

    if (Number.isFinite(options.timeoutMs)) {
      this.timer = setTimeout(() => {
        this.finish({ kind: CodemodeErrorKind.Timeout, message: `Execution timed out after ${options.timeoutMs} ms` });
      }, options.timeoutMs);
    }

    if (options.signal) {
      if (options.signal.aborted) {
        this.onAbort();
      } else {
        options.signal.addEventListener("abort", this.onAbort, { once: true });
      }
    }

    void options.wasm
      .then(
        (wasm) => this.start(options, wasm),
        (error: unknown) => {
          this.finish({ kind: CodemodeErrorKind.Sandbox, message: `Failed to load QuickJS: ${errorMessage(error)}` });
        },
      )
      .catch(this.onHostError);
  }

  abort(message: string): Promise<CodemodeResult> {
    this.finish({ kind: CodemodeErrorKind.Aborted, message });

    return this.promise;
  }

  private start(options: ExecutionOptions, wasm: CodemodeWasmModule): void {
    if (this.finished) {
      return;
    }

    try {
      const workerData = this.createWorkerData(options, wasm);
      this.worker = new Worker(options.workerUrl, { workerData });
      this.attachWorkerListeners(this.worker);
    } catch (error) {
      this.finish({ kind: CodemodeErrorKind.Sandbox, message: `Failed to start worker: ${errorMessage(error)}` });
    }
  }

  private createWorkerData(options: ExecutionOptions, wasm: CodemodeWasmModule): WorkerData {
    return {
      code: options.code,
      tools: [...options.tools.values()].map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
      })),
      globals: [...options.globals.values()].map((global) => ({
        name: global.name,
        spread: global.spread === true,
      })),
      wasm,
      memoryLimitBytes: options.memoryLimitBytes,
      store: options.store,
      interrupt: this.interrupt,
    };
  }

  private attachWorkerListeners(worker: Worker): void {
    worker.on(WorkerEvents.Message, this.onWorkerMessage);
    worker.on(WorkerEvents.Error, this.onWorkerError);
    worker.on(WorkerEvents.Exit, this.onWorkerExit);
  }

  private readonly onWorkerMessage = (message: unknown): void => {
    // An exception here would be uncaught in the host process and leave the execution unsettled.
    try {
      this.handleMessage(message);
    } catch (error) {
      this.onHostError(error);
    }
  };

  private readonly onHostError = (error: unknown): void => {
    this.finish({
      kind: CodemodeErrorKind.Sandbox,
      message:
        error instanceof BridgeError
          ? `Sandbox bridge broken: ${error.message}. The script may have modified built-ins such as a prototype's toJSON.`
          : `Sandbox host failed: ${errorMessage(error)}`,
    });
  };

  private readonly onWorkerError = (error: unknown): void => {
    this.finish({
      kind: CodemodeErrorKind.Sandbox,
      ...(error instanceof Error ? { name: error.name } : {}),
      message: errorMessage(error),
    });
  };

  private readonly onWorkerExit = (code: number): void => {
    this.finish({
      kind: CodemodeErrorKind.Sandbox,
      message: `Worker exited with code ${code} before the script settled`,
    });
  };

  private readonly onAbort = (): void => {
    const reason: unknown = this.signal?.reason;
    this.finish({
      kind: CodemodeErrorKind.Aborted,
      message: reason instanceof Error ? reason.message : "Execution aborted",
    });
  };

  private post(message: HostToWorkerMessage): void {
    this.worker?.postMessage(message);
  }

  private handleMessage(message: unknown): void {
    if (this.finished) {
      return;
    }

    if (!isWorkerToHostMessage(message)) {
      throw new BridgeError("unknown message from the worker");
    }

    switch (message.type) {
      case WorkerToHostMessageType.Output:
        this.output.push(message.item);
        break;

      case WorkerToHostMessageType.Call:
        this.handleCall(message);
        break;

      case WorkerToHostMessageType.Done:
        this.handleDone(message);
        break;

      case WorkerToHostMessageType.Crash:
        this.finish({ kind: CodemodeErrorKind.Sandbox, message: message.message });
        break;
    }
  }

  private handleDone(message: DoneMessage): void {
    // Decode everything before finish(), which must not throw once it starts.
    if (!message.ok) {
      this.finish(parseScriptError(message.error));
      return;
    }

    const value = message.value === undefined ? undefined : parseBridgeJson(message.value, "return value");
    this.finish(undefined, value, parseStoreWrites(message.writes));
  }

  private handleCall(message: CallMessage): void {
    const pending = this.beginCall(message);

    void this.invokeCall(message, pending.controller.signal)
      .then((reply) => this.completeCall(reply, pending))
      .catch(this.onHostError);
  }

  private beginCall(message: CallMessage): PendingCall {
    if (this.pending.has(message.id)) {
      throw new BridgeError(`duplicate call id ${message.id}`);
    }

    let record: CodemodeCall | undefined;
    if (message.target === "tool") {
      record = { name: message.name, status: "cancelled", durationMs: 0 };
      this.calls.push(record);
    }

    const pending: PendingCall = { record, startedAt: performance.now(), controller: new AbortController() };
    this.pending.set(message.id, pending);

    return pending;
  }

  private async invokeCall(message: CallMessage, signal: AbortSignal): Promise<HostToWorkerMessage> {
    const { id, name, target } = message;

    try {
      const tool = (target === "tool" ? this.tools : this.globals).get(name);
      if (!tool) {
        throw new Error(`Unknown ${target} "${name}"`);
      }

      const args: unknown = message.args === undefined ? undefined : JSON.parse(message.args);
      const value = await tool.execute(args, { signal });

      return {
        type: HostToWorkerMessageType.Result,
        id,
        ok: true,
        payload: value === undefined ? undefined : encodeJson(value),
      };
    } catch (error) {
      return { type: HostToWorkerMessageType.Result, id, ok: false, payload: errorMessage(error) };
    }
  }

  private completeCall(reply: HostToWorkerMessage, pending: PendingCall): void {
    // Already cancelled by finish(): the record keeps "cancelled" and the
    // worker is gone or going.
    if (!this.pending.delete(reply.id)) {
      return;
    }

    if (pending.record) {
      pending.record.status = reply.ok ? "ok" : "error";
      pending.record.durationMs = performance.now() - pending.startedAt;
    }

    this.post(reply);
  }

  private finish(error: CodemodeError | undefined, value?: unknown, writes?: CodemodeStoreWrites): void {
    if (this.finished) {
      return;
    }

    this.finished = true;
    clearTimeout(this.timer);
    this.signal?.removeEventListener("abort", this.onAbort);
    this.cancelPendingCalls();

    const result: CodemodeResult = error
      ? { ok: false, error, output: this.output, calls: this.calls }
      : {
          ok: true,
          value,
          output: this.output,
          calls: this.calls,
          storeWrites: writes ?? { set: {}, delete: [] },
        };

    void this.terminateWorker()
      .catch(() => undefined)
      .then(() => this.resolveResult(result));
  }

  private cancelPendingCalls(): void {
    const now = performance.now();

    for (const pending of this.pending.values()) {
      if (pending.record) {
        pending.record.durationMs = now - pending.startedAt;
      }

      pending.controller.abort();
    }

    this.pending.clear();
  }

  private async terminateWorker(): Promise<void> {
    if (!this.worker) {
      return;
    }

    Atomics.store(new Int32Array(this.interrupt), 0, 1);
    await this.worker.terminate();
  }
}

/**
 * Runs JavaScript in a QuickJS VM (a separate wasm instance) inside a worker
 * thread. The script sees `tools.<name>(args)` for every registered tool, `ALL_TOOLS`,
 * the output helpers `text`, `image`, `exit`, and `console.*`, `store`/`load`, and the
 * configured globals; nothing else (no timers, `fetch`, `process`, `require`, modules).
 *
 * Each `execute()` gets its own worker and VM; the sandbox only holds the tool
 * table and defaults. `close()` aborts in-flight executions.
 */
export class CodemodeSandbox {
  private readonly toolsByName = new Map<string, CodemodeTool>();
  private readonly globalsByName = new Map<string, CodemodeTool>();
  private readonly timeoutMs: number;
  private readonly memoryLimitBytes: number;
  private readonly wasm: CodemodeWasmModule | Promise<CodemodeWasmModule> | undefined;
  private readonly workerUrl: string | URL;
  private readonly running = new Set<Execution>();
  private closed = false;

  constructor(options: CodemodeSandboxOptions = {}) {
    const memoryLimitBytes =
      options.memoryLimitBytes === undefined ? DEFAULT_MEMORY_LIMIT_BYTES : options.memoryLimitBytes;
    if (!isMemoryLimitBytes(memoryLimitBytes)) {
      throw new RangeError(`memoryLimitBytes must be an integer between 1 and ${MAX_MEMORY_LIMIT_BYTES}`);
    }

    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.memoryLimitBytes = memoryLimitBytes;
    this.wasm = options.wasm;
    this.workerUrl = options.workerUrl ?? defaultWorkerUrl();

    for (const tool of options.tools ?? []) {
      this.registerTool(tool);
    }

    this.registerGlobals(options.globals ?? []);
  }

  private registerGlobals(globals: CodemodeTool[]): void {
    const namespaces = new Set<string>();

    for (const global of globals) {
      const parts = global.name.split(".");
      if (!validGlobalName(parts)) {
        throw new Error(`Invalid global name "${global.name}"`);
      }

      if (this.globalsByName.has(global.name)) {
        throw new Error(`Global "${global.name}" is already registered`);
      }

      if (parts.length === 2) {
        namespaces.add(parts[0] ?? "");
      }

      this.globalsByName.set(global.name, global);
    }

    for (const name of namespaces) {
      if (this.globalsByName.has(name)) {
        throw new Error(`Global "${name}" conflicts with the namespace "${name}"`);
      }
    }
  }

  /** Throws if a tool with the same name is already registered. */
  registerTool(tool: CodemodeTool): void {
    if (this.toolsByName.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered`);
    }

    this.toolsByName.set(tool.name, tool);
  }

  unregisterTool(name: string): boolean {
    return this.toolsByName.delete(name);
  }

  get tools(): CodemodeTool[] {
    return [...this.toolsByName.values()];
  }

  get globals(): CodemodeTool[] {
    return [...this.globalsByName.values()];
  }

  /**
   * `code` is an async function body: `return` and top-level `await` work.
   * Never rejects for script failures; those come back as `{ ok: false }`.
   * The script can use `store(key, value)` and `load(key)` on `options.store`.
   */
  execute(code: string, options: CodemodeExecuteOptions = {}): Promise<CodemodeResult> {
    if (this.closed) {
      return Promise.reject(new Error("Sandbox is closed"));
    }

    const execution = new Execution({
      code,
      tools: new Map(this.toolsByName),
      globals: this.globalsByName,
      timeoutMs: options.timeoutMs ?? this.timeoutMs,
      signal: options.signal,
      memoryLimitBytes: this.memoryLimitBytes,
      store: serializeStore(options.store),
      wasm: this.wasm === undefined ? loadQuickJSWasm() : Promise.resolve(this.wasm),
      workerUrl: this.workerUrl,
    });
    this.running.add(execution);

    return execution.promise.finally(() => this.running.delete(execution));
  }

  /** Aborts in-flight executions (they resolve with `kind: "aborted"`) and rejects new ones. */
  async close(): Promise<void> {
    this.closed = true;

    await Promise.all([...this.running].map((execution) => execution.abort("Sandbox closed")));
  }
}

function isStoreWrite(value: unknown): value is [string] | [string, string] {
  if (!isArray(value) || typeof value[0] !== "string") {
    return false;
  }

  return value.length === 1 || (value.length === 2 && typeof value[1] === "string");
}

function validGlobalName(parts: string[]): boolean {
  return parts.length <= 2 && parts.every((part) => IDENTIFIER.test(part)) && !RESERVED_GLOBALS.has(parts[0] ?? "");
}
