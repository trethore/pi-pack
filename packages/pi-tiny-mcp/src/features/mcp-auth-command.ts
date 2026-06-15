import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

import type { TinyMcpRuntime } from '#src/core/runtime.js';

export function registerMcpAuthCommand(pi: ExtensionAPI, getRuntime: () => Promise<TinyMcpRuntime>): void {
  pi.registerCommand('mcp-auth', {
    description: 'Authorize an OAuth MCP server',
    handler: async (args, ctx) => {
      await handleMcpAuthCommand(args ?? '', ctx, getRuntime);
    },
  });
}

async function handleMcpAuthCommand(
  args: string,
  ctx: ExtensionContext,
  getRuntime: () => Promise<TinyMcpRuntime>
): Promise<void> {
  const [serverName, ...codeParts] = args.trim().split(/\s+/).filter(Boolean);
  if (!serverName) {
    notify(ctx, 'Usage: /mcp-auth <server> [authorization-code-or-redirect-url]', 'warning');
    return;
  }

  const authorization = parseAuthorization(codeParts.join(' '));
  const runtime = await getRuntime();
  const result = await runtime.authorizeServer(serverName, authorization.code, authorization.state);

  if (result.status === 'authorized') {
    notify(ctx, `pi-tiny-mcp OAuth authorized ${serverName}.`, 'info');
    await runtime.connectServer(serverName).catch((error: unknown) => {
      notify(ctx, `OAuth succeeded, but reconnect failed: ${formatErrorMessage(error)}`, 'warning');
    });
    return;
  }

  notify(
    ctx,
    [
      `Open this URL to authorize ${serverName}:`,
      result.authorizationUrl ?? '(authorization URL unavailable)',
      `Then run /mcp-auth ${serverName} <authorization-code-or-redirect-url>.`,
    ].join('\n'),
    'info'
  );
}

interface ParsedAuthorization {
  code?: string;
  state?: string;
}

function parseAuthorization(value: string): ParsedAuthorization {
  const trimmed = value.trim();
  return trimmed ? parseNonEmptyAuthorization(trimmed) : {};
}

function parseNonEmptyAuthorization(value: string): ParsedAuthorization {
  const url = parseUrl(value);
  return url ? parseAuthorizationUrl(url, value) : { code: value };
}

function parseAuthorizationUrl(url: URL, fallbackCode: string): ParsedAuthorization {
  return {
    code: url.searchParams.get('code') ?? fallbackCode,
    state: url.searchParams.get('state') ?? undefined,
  };
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}

function notify(ctx: ExtensionContext, message: string, level: 'info' | 'warning' | 'error'): void {
  if (ctx.hasUI) ctx.ui.notify(message, level);
  else console.log(message);
}

function formatErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
