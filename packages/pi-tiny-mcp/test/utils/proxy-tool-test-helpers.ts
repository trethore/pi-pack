import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import type { TinyMcpRuntime } from '#pi-tiny-mcp/core/runtime.js';
import { registerProxyTool } from '#pi-tiny-mcp/features/proxy-tool.js';
import { createTinyMcpConfig } from '#test/utils/config-test-helpers.js';

export type RegisteredTool = Parameters<ExtensionAPI['registerTool']>[0];

export function createRegisteredProxyTool(runtime: Partial<TinyMcpRuntime>): RegisteredTool {
  const runtimeWithDefaults = {
    hasServer: (serverName: string) => serverName === 'github',
    ...runtime,
  };
  let registeredTool: RegisteredTool | undefined;
  const pi = {
    registerTool(tool: RegisteredTool) {
      registeredTool = tool;
    },
  } as Pick<ExtensionAPI, 'registerTool'> as ExtensionAPI;

  registerProxyTool(
    pi,
    createTinyMcpConfig({ servers: { github: { command: 'npx' } } }),
    async () => runtimeWithDefaults as TinyMcpRuntime
  );
  if (!registeredTool) throw new Error('proxy tool was not registered');
  return registeredTool;
}

export async function executeProxyTool(tool: RegisteredTool, params: Record<string, unknown>) {
  return tool.execute('tool-call-id', params as never, undefined, undefined, undefined as never);
}
