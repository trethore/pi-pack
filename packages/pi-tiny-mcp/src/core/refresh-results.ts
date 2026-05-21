import type { RefreshResult } from '#src/core/runtime.js';

export function countFailedRefreshResults(results: readonly RefreshResult[]): number {
  return results.filter((result) => result.status === 'failed').length;
}

export function formatRefreshResults(results: readonly RefreshResult[]): string {
  if (results.length === 0) return 'No MCP servers configured.';
  return results.map((result) => formatRefreshResult(result)).join('\n');
}

function formatRefreshResult(result: RefreshResult): string {
  const suffix = result.error ? `: ${result.error}` : '';
  return `${result.serverName}: ${result.status} (${result.toolCount} tools)${suffix}`;
}
