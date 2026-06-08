import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';

import { loadConfig } from '#src/config/config.js';
import type { PiTinyMcpConfig } from '#src/config/schema.js';
import { TinyMcpRuntime } from '#src/core/runtime.js';
import { registerMcpAuthCommand } from '#src/features/mcp-auth-command.js';
import { registerMcpCommand } from '#src/features/mcp-command.js';
import { registerDirectTools, shouldRegisterProxyTool } from '#src/features/direct-tools.js';
import { registerProxyTool } from '#src/features/proxy-tool.js';

export default function piTinyMcp(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());
  registerConfigDiagnostics(pi, loadedConfig.errors);

  if (!loadedConfig.config.enabled) return;

  const runtimeController = createRuntimeController(loadedConfig.config);
  if (shouldRegisterProxyTool(loadedConfig.config)) {
    registerProxyTool(pi, loadedConfig.config, runtimeController.getRuntime);
  }
  registerMcpCommand(pi, runtimeController.getRuntime);
  registerMcpAuthCommand(pi, runtimeController.getRuntime);

  pi.on('session_start', async (_event, _ctx: ExtensionContext) => {
    const runtime = await runtimeController.restart();
    if (runtime) registerDirectTools(pi, loadedConfig.config, runtime, runtimeController.getRuntime);
  });

  pi.on('session_shutdown', async () => {
    await runtimeController.shutdown();
  });
}

function createRuntimeController(config: PiTinyMcpConfig) {
  let runtime: TinyMcpRuntime | null = null;
  let runtimePromise: Promise<TinyMcpRuntime> | null = null;

  async function createRuntime(): Promise<TinyMcpRuntime> {
    const nextRuntime = new TinyMcpRuntime(config);
    await nextRuntime.start();
    runtime = nextRuntime;
    return nextRuntime;
  }

  async function getRuntime(): Promise<TinyMcpRuntime> {
    if (runtime) return runtime;
    runtimePromise ??= createRuntime().finally(() => {
      runtimePromise = null;
    });
    return runtimePromise;
  }

  async function shutdown(): Promise<void> {
    const startingRuntime = runtimePromise;
    const currentRuntime = runtime;
    runtime = null;

    if (startingRuntime) {
      const startedRuntime = await startingRuntime.catch(() => null);
      if (startedRuntime) {
        await startedRuntime.shutdown();
        if (runtime === startedRuntime) runtime = null;
      }
      return;
    }

    if (currentRuntime) await currentRuntime.shutdown();
  }

  async function restart(): Promise<TinyMcpRuntime | null> {
    await shutdown();
    runtimePromise = createRuntime().finally(() => {
      runtimePromise = null;
    });
    return runtimePromise.catch((error: unknown) => {
      console.error('pi-tiny-mcp initialization failed:', error);
      return null;
    });
  }

  return { getRuntime, restart, shutdown };
}
