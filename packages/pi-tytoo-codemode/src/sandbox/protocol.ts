import { isRecord, isArray } from "#src/sandbox/values";
import type { CodemodeOutputItem } from "#src/sandbox/types";
import type { CodemodeWasmModule } from "#src/sandbox/wasm";

/**
 * Messages between the host (main thread) and the worker. Tool arguments,
 * results, and values cross as JSON strings: the worker passes them into and
 * out of the QuickJS VM as strings and never builds structured values itself.
 */

export interface WorkerData {
  code: string;
  /** `jsName` is the identifier the script uses; `description` is listed in `ALL_TOOLS`. */
  tools: { name: string; jsName: string; description: string }[];
  globals: { name: string; spread: boolean }[];
  /** Compiled `quickjs-wasi` module. Structured clone shares the compiled code with the worker. */
  wasm: CodemodeWasmModule;
  memoryLimitBytes: number | undefined;
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

export type WorkerToHostMessage =
  | { type: "call"; id: number; target: "tool" | "global"; name: string; args: string | undefined }
  | { type: "output"; item: CodemodeOutputItem }
  /** `writes` is a JSON array of `[key, json]` for `store()` and `[key]` for deletions. */
  | { type: "done"; ok: true; value: string | undefined; writes: string }
  | { type: "done"; ok: false; error: ScriptErrorJson }
  /** The VM failed outside the script's control, for example a wasm trap. */
  | { type: "crash"; message: string };

export type HostToWorkerMessage =
  /** `payload` is the JSON result when `ok`, otherwise the error message. */
  { type: "result"; id: number; ok: boolean; payload: string | undefined };

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}
function isOutputItem(value: unknown): value is CodemodeOutputItem {
  if (!isRecord(value)) {
    return false;
  }
  if (value.type === "text") {
    return typeof value.text === "string" && (value.console === undefined || value.console === true);
  }
  return value.type === "image" && typeof value.data === "string" && typeof value.mimeType === "string";
}
export function isWorkerToHostMessage(value: unknown): value is WorkerToHostMessage {
  if (!isRecord(value)) {
    return false;
  }
  switch (value.type) {
    case "output":
      return isOutputItem(value.item);
    case "call":
      return isCallMessage(value);
    case "done":
      return isDoneMessage(value);
    case "crash":
      return typeof value.message === "string";
    default:
      return false;
  }
}
function isCallMessage(value: Record<string, unknown>): boolean {
  return (
    Number.isSafeInteger(value.id) &&
    (value.target === "tool" || value.target === "global") &&
    typeof value.name === "string" &&
    isOptionalString(value.args)
  );
}
function isDoneMessage(value: Record<string, unknown>): boolean {
  if (value.ok === false) {
    return typeof value.error === "string";
  }
  return value.ok === true && isOptionalString(value.value) && typeof value.writes === "string";
}
export function isHostToWorkerMessage(value: unknown): value is HostToWorkerMessage {
  return (
    isRecord(value) &&
    value.type === "result" &&
    Number.isSafeInteger(value.id) &&
    typeof value.ok === "boolean" &&
    isOptionalString(value.payload)
  );
}
export function isToolDefinitions(value: unknown): value is WorkerData["tools"] {
  return (
    isArray(value) &&
    value.every(
      (tool) =>
        isRecord(tool) &&
        typeof tool.name === "string" &&
        typeof tool.jsName === "string" &&
        typeof tool.description === "string",
    )
  );
}
export function isGlobalDefinitions(value: unknown): value is WorkerData["globals"] {
  return (
    isArray(value) &&
    value.every((entry) => isRecord(entry) && typeof entry.name === "string" && typeof entry.spread === "boolean")
  );
}
export function isStoreSnapshot(value: unknown): value is WorkerData["store"] {
  return isRecord(value) && Object.values(value).every((entry) => typeof entry === "string");
}
export function isWorkerData(value: unknown): value is WorkerData {
  if (!isRecord(value) || typeof value.code !== "string" || !isRecord(value.wasm)) {
    return false;
  }
  return (
    isToolDefinitions(value.tools) &&
    isGlobalDefinitions(value.globals) &&
    isStoreSnapshot(value.store) &&
    value.interrupt instanceof SharedArrayBuffer &&
    value.interrupt.byteLength === 4 &&
    (value.memoryLimitBytes === undefined || typeof value.memoryLimitBytes === "number")
  );
}
