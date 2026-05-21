import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import { clearMetadataCache } from '#src/core/metadata-cache.js';
import { countFailedRefreshResults, formatRefreshResults } from '#src/core/refresh-results.js';
import type { TinyMcpRuntime } from '#src/core/runtime.js';

export function registerMcpCommand(
  pi: ExtensionAPI,
  getRuntime: () => Promise<TinyMcpRuntime>
): void {
  pi.registerCommand('mcp', {
    description: 'Show MCP server status and manage MCP cache/connections',
    handler: async (args, ctx) => {
      await handleMcpCommand(args ?? '', ctx, getRuntime);
    },
  });
}

async function handleMcpCommand(
  args: string,
  ctx: ExtensionContext,
  getRuntime: () => Promise<TinyMcpRuntime>
): Promise<void> {
  const [subcommand = 'status', target, extra] = args.trim().split(/\s+/).filter(Boolean);

  if (subcommand === 'cache' && target === 'clear') {
    clearMetadataCache();
    notify(
      ctx,
      'pi-tiny-mcp cache cleared. Restart Pi or reconnect servers to rebuild metadata.',
      'info'
    );
    return;
  }

  const runtime = await getRuntime();
  if (subcommand === 'reconnect' && target) {
    await runtime.connectServer(target);
    notify(ctx, `pi-tiny-mcp reconnected ${target}.`, 'info');
    return;
  }

  if (subcommand === 'refresh') {
    await refreshMetadata(ctx, runtime, target);
    return;
  }

  if (subcommand === 'tools') {
    showTools(ctx, runtime, target);
    return;
  }

  if (extra) notify(ctx, `Ignoring extra /mcp arguments after "${target}".`, 'warning');
  showStatus(ctx, runtime);
}

async function refreshMetadata(
  ctx: ExtensionContext,
  runtime: TinyMcpRuntime,
  serverName?: string
): Promise<void> {
  if (serverName && !runtime.hasServer(serverName)) {
    notify(ctx, `pi-tiny-mcp: server "${serverName}" is not configured.`, 'error');
    return;
  }

  const results = serverName
    ? [await runtime.refreshServer(serverName)]
    : await runtime.refreshAllServers();
  const failedCount = countFailedRefreshResults(results);
  const level = failedCount > 0 ? 'warning' : 'info';
  notify(ctx, formatRefreshResults(results), level);
}

function showStatus(ctx: ExtensionContext, runtime: TinyMcpRuntime): void {
  const lines = runtime.getStatus().map((server) => {
    const error = server.error ? `: ${server.error}` : '';
    return `${server.name}: ${server.status} (${server.toolCount} tools)${error}`;
  });
  notify(ctx, lines.length > 0 ? lines.join('\n') : 'pi-tiny-mcp: no servers configured.', 'info');
}

function showTools(ctx: ExtensionContext, runtime: TinyMcpRuntime, serverName?: string): void {
  const tools = runtime.listTools(serverName);
  const text =
    tools.length === 0
      ? 'No MCP tools cached.'
      : tools.map((tool) => `${tool.name} - ${tool.description || '(no description)'}`).join('\n');
  notify(ctx, text, 'info');
}

function notify(ctx: ExtensionContext, message: string, level: 'info' | 'warning' | 'error'): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}
