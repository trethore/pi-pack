/**
 * Worker thread entry. One worker runs one script inside a fresh QuickJS VM
 * (a separate wasm instance), relays tool calls and output to the host, and
 * reports the result. The host terminates the worker when the script settles,
 * times out, or is aborted; the worker exists so that a spinning script never
 * blocks the host thread.
 */
import { readFileSync } from "node:fs";
import { parentPort, workerData } from "node:worker_threads";
import { JSException, type JSValueHandle, MAX_STACK_SIZE, QuickJS } from "quickjs-wasi";
import {
  BridgeMessageType,
  BridgeOutputType,
  isBridgeMessageType,
  type BridgeCallType,
} from "#src/sandbox/bridge-protocol";
import {
  WorkerToHostMessageType,
  isHostToWorkerMessage,
  isWorkerData,
  type HostToWorkerMessage,
  type WorkerData,
  type WorkerToHostMessage,
} from "#src/sandbox/protocol";
import type { CodemodeOutputItem } from "#src/sandbox/types";
import { discardOutput } from "#src/sandbox/wasi";
import { WorkerEvents } from "#src/sandbox/worker-events";
import { PRELUDE_FILENAME } from "#src/sandbox/constants";

const PRELUDE_SOURCE = readFileSync(new URL("./prelude.js", import.meta.url), "utf8");

interface PreludeApi {
  receiver: JSValueHandle;
  settle: JSValueHandle;
  run: JSValueHandle;
  stalled: JSValueHandle;
}

function post(message: WorkerToHostMessage): void {
  // Worker ports do not use the browser postMessage targetOrigin argument.
  // oxlint-disable-next-line unicorn/require-post-message-target-origin
  parentPort?.postMessage(message);
}

function crash(error: unknown): void {
  post({
    type: WorkerToHostMessageType.Crash,
    message: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
}

function describeException(error: JSException): string {
  const head = error.message ? `${error.name}: ${error.message}` : error.name;
  const stack = error.stack?.trimEnd();

  return JSON.stringify({ name: error.name, message: error.message, stack: stack ? `${head}\n${stack}` : head });
}

function optionalString(value: JSValueHandle | undefined): string | undefined {
  return value === undefined || value.isUndefined ? undefined : value.toString();
}

function createVm(data: WorkerData): Promise<QuickJS> {
  const interrupt = new Int32Array(data.interrupt);

  return QuickJS.create({
    wasm: data.wasm,
    memoryLimit: data.memoryLimitBytes,
    // Without a guard, deep recursion overflows the wasm stack and traps instead of throwing a
    // catchable RangeError.
    maxStackSize: MAX_STACK_SIZE,
    interruptHandler: () => Atomics.load(interrupt, 0) !== 0,
    wasi: discardOutput,
  });
}

function postCall(kind: BridgeCallType, id: JSValueHandle, name: JSValueHandle, args: JSValueHandle | undefined): void {
  post({
    type: WorkerToHostMessageType.Call,
    id: id.toNumber(),
    target: kind === BridgeMessageType.Call ? "tool" : "global",
    name: name.toString(),
    args: optionalString(args),
  });
}

function readOutputItem(kind: JSValueHandle, value: JSValueHandle, mimeType: JSValueHandle): CodemodeOutputItem {
  const type = kind.toString();
  const data = value.toString();

  if (type === BridgeOutputType.Image) {
    return { type: BridgeOutputType.Image, data, mimeType: mimeType.toString() };
  }

  if (type === BridgeOutputType.Console) {
    return { type: BridgeOutputType.Text, text: data, console: true };
  }

  return { type: BridgeOutputType.Text, text: data };
}

function postDone(ok: JSValueHandle, payload: JSValueHandle, writes: JSValueHandle): void {
  if (!ok.toBoolean()) {
    post({ type: WorkerToHostMessageType.Done, ok: false, error: payload.toString() });
    return;
  }

  post({
    type: WorkerToHostMessageType.Done,
    ok: true,
    value: optionalString(payload),
    writes: writes.toString(),
  });
}

function createHostBridge(vm: QuickJS): JSValueHandle {
  // Called from the prelude with primitives only.
  return vm.newFunction("bridge", (kind, first, second, third) => {
    const type = kind.toString();
    if (!isBridgeMessageType(type)) {
      return vm.undefined;
    }

    switch (type) {
      case BridgeMessageType.Call:
      case BridgeMessageType.Global:
        postCall(type, first, second, third);
        break;

      case BridgeMessageType.Output:
        post({ type: WorkerToHostMessageType.Output, item: readOutputItem(first, second, third) });
        break;

      case BridgeMessageType.Done:
        postDone(first, second, third);
        break;
    }

    return vm.undefined;
  });
}

function createPrelude(vm: QuickJS, data: WorkerData): PreludeApi {
  const bridge = createHostBridge(vm);

  // The VM lives until the host terminates the worker, so these handles are never disposed.
  const receiver = vm.withScope((scope) =>
    scope.escape(
      vm.callFunction(
        vm.evalCode(PRELUDE_SOURCE, PRELUDE_FILENAME),
        vm.undefined,
        bridge,
        vm.newString(JSON.stringify(data.tools)),
        vm.newString(JSON.stringify(data.globals)),
        vm.newString(JSON.stringify(data.store)),
      ),
    ),
  );

  return {
    receiver,
    settle: receiver.getProp("settle"),
    run: receiver.getProp("run"),
    stalled: receiver.getProp("stalled"),
  };
}

/** Run queued jobs, then fail a script that waits on nothing that can ever resume it. */
function drainJobs(vm: QuickJS, api: PreludeApi): void {
  vm.executePendingJobs();
  vm.callFunction(api.stalled, api.receiver).dispose();
}

function settleCall(vm: QuickJS, api: PreludeApi, message: HostToWorkerMessage): void {
  vm.withScope(() => {
    vm.callFunction(
      api.settle,
      api.receiver,
      vm.newNumber(message.id),
      message.ok ? vm.true : vm.false,
      message.payload === undefined ? vm.undefined : vm.newString(message.payload),
    );
  });
}

function handleHostMessage(vm: QuickJS, api: PreludeApi, message: unknown): void {
  if (!isHostToWorkerMessage(message)) {
    return;
  }

  try {
    settleCall(vm, api, message);
    drainJobs(vm, api);
  } catch (error) {
    crash(error);
  }
}

function runScript(vm: QuickJS, api: PreludeApi, code: string): void {
  // The prefix shares the first line with the script so reported line numbers
  // match the script as written.
  let fn: JSValueHandle;
  try {
    fn = vm.evalCode(`(async (tools, console) => {${code}\n})`, "codemode.js");
  } catch (error) {
    if (!(error instanceof JSException)) {
      throw error;
    }

    post({ type: WorkerToHostMessageType.Done, ok: false, error: describeException(error) });
    return;
  }

  try {
    vm.callFunction(api.run, api.receiver, fn).dispose();
  } finally {
    fn.dispose();
  }

  drainJobs(vm, api);
}

async function main(data: WorkerData): Promise<void> {
  const vm = await createVm(data);
  const api = createPrelude(vm, data);

  parentPort?.on(WorkerEvents.Message, (message: unknown) => handleHostMessage(vm, api, message));

  runScript(vm, api, data.code);
}

if (parentPort) {
  if (!isWorkerData(workerData)) {
    throw new Error("Invalid sandbox worker data");
  }

  void main(workerData).catch(crash);
}
