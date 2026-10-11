import { isRecord, isArray } from "#src/sandbox/values";
import type { CodemodeOutputItem } from "#src/sandbox/types";
import { isWasmModule, type CodemodeWasmModule } from "#src/sandbox/wasm";
import { isMemoryLimitBytes } from "#src/sandbox/limits";

/**
 * Messages between the host (main thread) and the worker. Tool arguments,
 * results, and values cross as JSON strings: the worker passes them into and
 * out of the QuickJS VM as strings and never builds structured values itself.
 */

interface ToolDefinition {
  name: string;
  jsName: string;
  description: string;
}

interface GlobalDefinition {
  name: string;
  spread: boolean;
}

export interface WorkerData {
  code: string;
  /** `jsName` is the identifier the script uses; `description` is listed in `ALL_TOOLS`. */
  tools: ToolDefinition[];
  globals: GlobalDefinition[];
  /** Compiled `quickjs-wasi` module. Structured clone shares the compiled code with the worker. */
  wasm: CodemodeWasmModule;
  memoryLimitBytes: number;
  /** Snapshot for `load()`: key to JSON text. */
  store: Record<string, string>;
  /**
   * One Int32 the host sets to non-zero before terminating the worker. The VM's interrupt handler
   * polls it, because Bun's `worker.terminate()` cannot stop a thread that is spinning in wasm.
   */
  interrupt: SharedArrayBuffer;
}

/** JSON-encoded `{ name?, message, stack? }` of an error thrown by the script. */
type ScriptErrorJson = string;

export const WorkerToHostMessageType = {
  Call: "call",
  Output: "output",
  Done: "done",
  Crash: "crash",
} as const;

export const HostToWorkerMessageType = {
  Result: "result",
} as const;

export type WorkerToHostMessage =
  | {
      type: typeof WorkerToHostMessageType.Call;
      id: number;
      target: "tool" | "global";
      name: string;
      args: string | undefined;
    }
  | { type: typeof WorkerToHostMessageType.Output; item: CodemodeOutputItem }
  /** `writes` is a JSON array of `[key, json]` for `store()` and `[key]` for deletions. */
  | { type: typeof WorkerToHostMessageType.Done; ok: true; value: string | undefined; writes: string }
  | { type: typeof WorkerToHostMessageType.Done; ok: false; error: ScriptErrorJson }
  /** The VM failed outside the script's control, for example a wasm trap. */
  | { type: typeof WorkerToHostMessageType.Crash; message: string };

export type HostToWorkerMessage =
  /** `payload` is the JSON result when `ok`, otherwise the error message. */
  { type: typeof HostToWorkerMessageType.Result; id: number; ok: boolean; payload: string | undefined };

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || isString(value);
}

function isOutputItem(value: unknown): value is CodemodeOutputItem {
  if (!isRecord(value)) {
    return false;
  }

  if (value.type === "text") {
    return isString(value.text) && (value.console === undefined || value.console === true);
  }

  return value.type === "image" && isString(value.data) && isString(value.mimeType);
}

export function isWorkerToHostMessage(value: unknown): value is WorkerToHostMessage {
  if (!isRecord(value)) {
    return false;
  }

  switch (value.type) {
    case WorkerToHostMessageType.Output:
      return isOutputItem(value.item);

    case WorkerToHostMessageType.Call:
      return isCallMessage(value);

    case WorkerToHostMessageType.Done:
      return isDoneMessage(value);

    case WorkerToHostMessageType.Crash:
      return isString(value.message);

    default:
      return false;
  }
}

function isCallMessage(value: Record<string, unknown>): boolean {
  return (
    Number.isSafeInteger(value.id) &&
    (value.target === "tool" || value.target === "global") &&
    isString(value.name) &&
    isOptionalString(value.args)
  );
}

function isDoneMessage(value: Record<string, unknown>): boolean {
  if (value.ok === false) {
    return isString(value.error);
  }

  return value.ok === true && isOptionalString(value.value) && isString(value.writes);
}

export function isHostToWorkerMessage(value: unknown): value is HostToWorkerMessage {
  return (
    isRecord(value) &&
    value.type === HostToWorkerMessageType.Result &&
    Number.isSafeInteger(value.id) &&
    typeof value.ok === "boolean" &&
    isOptionalString(value.payload)
  );
}

function isArrayOf<T>(value: unknown, isItem: (item: unknown) => item is T): value is T[] {
  if (!isArray(value)) {
    return false;
  }

  for (let index = 0; index < value.length; index++) {
    if (!Object.hasOwn(value, index) || !isItem(value[index])) {
      return false;
    }
  }

  return true;
}

function isToolDefinition(value: unknown): value is ToolDefinition {
  return isRecord(value) && isString(value.name) && isString(value.jsName) && isString(value.description);
}

export function isToolDefinitions(value: unknown): value is ToolDefinition[] {
  return isArrayOf(value, isToolDefinition);
}

function isGlobalDefinition(value: unknown): value is GlobalDefinition {
  return isRecord(value) && isString(value.name) && typeof value.spread === "boolean";
}

export function isGlobalDefinitions(value: unknown): value is GlobalDefinition[] {
  return isArrayOf(value, isGlobalDefinition);
}

export function isStoreSnapshot(value: unknown): value is WorkerData["store"] {
  return isRecord(value) && Object.values(value).every(isString);
}

export function isWorkerData(value: unknown): value is WorkerData {
  if (!isRecord(value) || !isString(value.code) || !isWasmModule(value.wasm)) {
    return false;
  }

  return (
    isToolDefinitions(value.tools) &&
    isGlobalDefinitions(value.globals) &&
    isStoreSnapshot(value.store) &&
    value.interrupt instanceof SharedArrayBuffer &&
    value.interrupt.byteLength === Int32Array.BYTES_PER_ELEMENT &&
    isMemoryLimitBytes(value.memoryLimitBytes)
  );
}
