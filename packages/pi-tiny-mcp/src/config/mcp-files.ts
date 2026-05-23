import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';
import { isRecord } from '@trethore/pi-shared/object.js';

import type { ServerConfig } from '#src/config/schema.js';

export interface StandardMcpConfigLoadResult {
  servers: Record<string, ServerConfig>;
  errors: string[];
}

export function loadStandardMcpServers(
  cwd: string,
  includeGlobal: boolean,
  includeProject: boolean
): StandardMcpConfigLoadResult {
  const errors: string[] = [];
  const servers: Record<string, ServerConfig> = {};

  for (const configPath of getStandardMcpConfigPaths(cwd, includeGlobal, includeProject)) {
    Object.assign(servers, readStandardMcpServers(configPath, errors));
  }

  return { servers, errors };
}

function getStandardMcpConfigPaths(
  cwd: string,
  includeGlobal: boolean,
  includeProject: boolean
): string[] {
  const paths: string[] = [];
  if (includeGlobal) paths.push(path.join(homedir(), '.config', 'mcp', 'mcp.json'));
  if (includeProject) paths.push(path.join(cwd, '.mcp.json'));
  return paths;
}

function readStandardMcpServers(
  configPath: string,
  errors: string[]
): Record<string, ServerConfig> {
  if (!existsSync(configPath)) return {};

  const parsed = readJsoncConfigFile<Record<string, unknown>>(
    configPath,
    'pi-tiny-mcp standard MCP',
    errors
  );
  if (!parsed) return {};
  if (!isRecord(parsed.mcpServers)) return {};

  const servers: Record<string, ServerConfig> = {};
  for (const [serverName, value] of Object.entries(parsed.mcpServers)) {
    if (!isRecord(value)) {
      errors.push(
        `pi-tiny-mcp ignored MCP server ${serverName} in ${configPath}; expected object.`
      );
      continue;
    }
    servers[serverName] = normalizeStandardServer(value);
  }
  return servers;
}

function normalizeStandardServer(value: Record<string, unknown>): ServerConfig {
  return {
    command: typeof value.command === 'string' ? value.command : undefined,
    args: asStringArray(value.args),
    env: asStringRecord(value.env),
    cwd: typeof value.cwd === 'string' ? value.cwd : undefined,
    url: typeof value.url === 'string' ? value.url : undefined,
    headers: asStringRecord(value.headers),
    auth: value.auth === 'bearer' || value.auth === 'oauth' ? value.auth : undefined,
    bearerToken: typeof value.bearerToken === 'string' ? value.bearerToken : undefined,
    bearerTokenEnv: typeof value.bearerTokenEnv === 'string' ? value.bearerTokenEnv : undefined,
    debug: typeof value.debug === 'boolean' ? value.debug : undefined,
  };
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
    ? value
    : undefined;
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (!entries.every(([, entryValue]) => typeof entryValue === 'string')) return undefined;
  return Object.fromEntries(entries) as Record<string, string>;
}
