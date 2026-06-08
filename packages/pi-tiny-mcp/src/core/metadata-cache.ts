import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { getGlobalConfigPath } from '@trethore/pi-shared/config/locations.js';
import { isRecord } from '@trethore/pi-shared/object.js';

import type { ServerConfig, ToolPrefix } from '#src/config/schema.js';
import { buildToolMetadata } from '#src/core/tool-metadata.js';
import type { McpResource, McpTool, ToolMetadata } from '#src/core/types.js';
import { interpolateEnvRecord, interpolateEnvVars, resolveConfigPath } from '#src/utils/env.js';

const CACHE_VERSION = 1;
const CACHE_FILE_NAME = 'pi-tiny-mcp-cache.json';

export interface CachedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export interface CachedResource {
  uri: string;
  name: string;
  description?: string;
}

export interface ServerCacheEntry {
  configHash: string;
  tools: CachedTool[];
  resources: CachedResource[];
  cachedAt: number;
}

export interface MetadataCache {
  version: number;
  servers: Record<string, ServerCacheEntry>;
}

export function getMetadataCachePath(): string {
  return getGlobalConfigPath(CACHE_FILE_NAME);
}

export function loadMetadataCache(): MetadataCache | null {
  const cachePath = getMetadataCachePath();
  if (!existsSync(cachePath)) return null;

  try {
    const parsed = JSON.parse(readFileSync(cachePath, 'utf8')) as unknown;
    if (!isMetadataCache(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveServerMetadataCache(serverName: string, entry: ServerCacheEntry): void {
  const cachePath = getMetadataCachePath();
  const cache = loadMetadataCache() ?? { version: CACHE_VERSION, servers: {} };
  cache.servers[serverName] = entry;

  mkdirSync(path.dirname(cachePath), { recursive: true });
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(cache, null, 2), 'utf8');
  renameSync(tmpPath, cachePath);
}

export function clearMetadataCache(): void {
  const cachePath = getMetadataCachePath();
  const tmpPath = `${cachePath}.${process.pid}.tmp`;
  mkdirSync(path.dirname(cachePath), { recursive: true });
  writeFileSync(tmpPath, JSON.stringify({ version: CACHE_VERSION, servers: {} }, null, 2), 'utf8');
  renameSync(tmpPath, cachePath);
}

export function createServerCacheEntry(
  definition: ServerConfig,
  tools: readonly McpTool[],
  resources: readonly McpResource[]
): ServerCacheEntry {
  return {
    configHash: computeServerHash(definition),
    tools: tools.filter((tool) => tool.name).map((tool) => toCachedTool(tool)),
    resources: resources
      .filter((resource) => resource.name && resource.uri)
      .map((resource) => toCachedResource(resource)),
    cachedAt: Date.now(),
  };
}

export function isServerCacheValid(
  entry: ServerCacheEntry | undefined,
  definition: ServerConfig,
  maxAgeHours: number
): entry is ServerCacheEntry {
  if (!entry || entry.configHash !== computeServerHash(definition)) return false;
  if (!Number.isFinite(entry.cachedAt)) return false;
  if (maxAgeHours <= 0) return true;
  return Date.now() - entry.cachedAt <= maxAgeHours * 60 * 60 * 1000;
}

export function reconstructToolMetadata(
  serverName: string,
  entry: ServerCacheEntry,
  definition: ServerConfig,
  prefix: ToolPrefix
): ToolMetadata[] {
  return buildToolMetadata(entry.tools, entry.resources, definition, serverName, prefix);
}

export function computeServerHash(definition: ServerConfig): string {
  const identity = {
    command: definition.command,
    args: definition.args,
    env: interpolateEnvRecord(definition.env),
    cwd: resolveConfigPath(definition.cwd),
    url: definition.url ? interpolateEnvVars(definition.url) : undefined,
    headers: interpolateEnvRecord(definition.headers),
    auth: definition.auth,
    bearerToken: definition.bearerToken ? interpolateEnvVars(definition.bearerToken) : undefined,
    bearerTokenEnv: definition.bearerTokenEnv ? interpolateEnvVars(definition.bearerTokenEnv) : undefined,
    exposeResources: definition.exposeResources,
    excludeTools: definition.excludeTools,
  };
  return createHash('sha256').update(stableStringify(identity)).digest('hex');
}

function toCachedTool(tool: McpTool): CachedTool {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function toCachedResource(resource: McpResource): CachedResource {
  return {
    uri: resource.uri,
    name: resource.name,
    description: resource.description,
  };
}

function stableStringify(value: unknown): string {
  if (!value || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`;

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record);
  keys.sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(',')}}`;
}

function isMetadataCache(value: unknown): value is MetadataCache {
  return isRecord(value) && value.version === CACHE_VERSION && isRecord(value.servers);
}
