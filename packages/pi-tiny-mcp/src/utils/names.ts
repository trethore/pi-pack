import type { ToolPrefix } from '#src/config/schema.js';

export function formatToolName(toolName: string, serverName: string, prefix: ToolPrefix): string {
  if (prefix === 'none') return toolName;

  const normalizedServerName = normalizeName(prefix === 'short' ? stripMcpSuffix(serverName) : serverName);
  return `${normalizedServerName}_${toolName}`;
}

export function isToolExcluded(
  toolName: string,
  serverName: string,
  prefix: ToolPrefix,
  excludedTools: readonly string[] | undefined
): boolean {
  if (!excludedTools || excludedTools.length === 0) return false;
  const prefixedName = formatToolName(toolName, serverName, prefix);
  return excludedTools.includes(toolName) || excludedTools.includes(prefixedName);
}

export function normalizeName(value: string): string {
  return value
    .replaceAll(/[^A-Za-z0-9_]/g, '_')
    .replaceAll(/_+/g, '_')
    .replaceAll(/^_|_$/g, '');
}

function stripMcpSuffix(value: string): string {
  return value.replaceAll(/[-_]?mcp[-_]?server$/gi, '').replaceAll(/[-_]?mcp$/gi, '') || value;
}
