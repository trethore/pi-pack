import { createBridge } from "#src/sandbox/prelude/bridge";
import type { HostBridge } from "#src/sandbox/bridge-protocol";
import { createLifecycle } from "#src/sandbox/prelude/lifecycle";
import { lockdown } from "#src/sandbox/prelude/lockdown";
import { createOutput } from "#src/sandbox/prelude/output";
import { createStore } from "#src/sandbox/prelude/store";
import { installGlobal, installTools } from "#src/sandbox/prelude/tools";
import { isToolDefinitions, isGlobalDefinitions, isStoreSnapshot } from "#src/sandbox/bootstrap";
import { parseJson } from "#src/sandbox/values";

function parseBootstrapData(toolsJson: string, globalsJson: string, storeJson: string) {
  const snapshot = parseJson(storeJson);
  const definitions = parseJson(toolsJson);
  const globals = parseJson(globalsJson);

  if (!isStoreSnapshot(snapshot) || !isToolDefinitions(definitions) || !isGlobalDefinitions(globals)) {
    throw new Error("Invalid sandbox bootstrap data");
  }

  return { definitions, globals, snapshot };
}

export default function initialize(bridge: HostBridge, toolsJson: string, globalsJson: string, storeJson: string) {
  lockdown();

  const { definitions, globals, snapshot } = parseBootstrapData(toolsJson, globalsJson, storeJson);

  const rpc = createBridge(bridge);
  const store = createStore(snapshot);
  const lifecycle = createLifecycle(bridge, store.serializeWrites);
  const output = createOutput(bridge, lifecycle);
  const tools = installTools(definitions, globals, rpc);

  installGlobal("store", store.store);
  installGlobal("load", store.load);
  installGlobal("exit", lifecycle.exit);
  installGlobal("text", output.text);
  installGlobal("image", output.image);
  installGlobal("console", output.console);

  return {
    settle: rpc.settle,
    run(fn: (tools: ReturnType<typeof installTools>, console: typeof output.console) => Promise<unknown>): void {
      lifecycle.run(() => fn(tools, output.console));
    },
    stalled: () => lifecycle.stalled(rpc.hasPending()),
  };
}
