import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z, type EnabledConfig } from '@trethore/pi-shared/config/schema.js';

type LifecycleMode = 'lazy' | 'eager' | 'keep-alive';
export type ToolPrefix = 'server' | 'short' | 'none';

export interface PiTinyMcpConfig {
  enabled: boolean;
  proxyTool: ProxyToolConfig;
  directTools: DirectToolsConfig;
  metadataCache: MetadataCacheConfig;
  lifecycle: LifecycleConfig;
  toolNames: ToolNamesConfig;
  sources: ConfigSourcesConfig;
  servers: Record<string, ServerConfig>;
}

interface ProxyToolConfig extends EnabledConfig {
  name: string;
  includeSchemasInSearch: boolean;
}

interface DirectToolsConfig extends EnabledConfig {
  disableProxyTool: boolean;
}

interface MetadataCacheConfig extends EnabledConfig {
  maxAgeHours: number;
}

export interface LifecycleConfig {
  defaultMode: LifecycleMode;
  idleTimeoutMinutes: number;
  healthCheckSeconds: number;
  startupConcurrency: number;
}

interface ToolNamesConfig {
  prefix: ToolPrefix;
}

interface ConfigSourcesConfig {
  standardGlobal: boolean;
  standardProject: boolean;
}

type ServerAuth = 'bearer' | 'oauth';

export interface ServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
  auth?: ServerAuth;
  bearerToken?: string;
  bearerTokenEnv?: string;
  lifecycle?: LifecycleMode;
  idleTimeoutMinutes?: number;
  exposeResources?: boolean;
  directTools?: boolean;
  excludeTools?: string[];
  debug?: boolean;
}

export type PartialPiTinyMcpConfig = Partial<{
  enabled: unknown;
  proxyTool: Partial<Record<keyof ProxyToolConfig, unknown>>;
  directTools: Partial<Record<keyof DirectToolsConfig, unknown>>;
  metadataCache: Partial<Record<keyof MetadataCacheConfig, unknown>>;
  lifecycle: Partial<Record<keyof LifecycleConfig, unknown>>;
  toolNames: Partial<Record<keyof ToolNamesConfig, unknown>>;
  sources: Partial<Record<keyof ConfigSourcesConfig, unknown>>;
  servers: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiTinyMcpConfig>;

export const lifecycleModeSchema = defineConfigSchema(
  z.enum(['lazy', 'eager', 'keep-alive']),
  'expected one of "lazy", "eager", "keep-alive"'
);

export const toolPrefixSchema = defineConfigSchema(
  z.enum(['server', 'short', 'none']),
  'expected one of "server", "short", "none"'
);

export const serverAuthSchema = defineConfigSchema(z.enum(['bearer', 'oauth']), 'expected one of "bearer", "oauth"');

export const stringSchema = defineConfigSchema(z.string(), 'expected string');

export const toolNameSchema = defineConfigSchema(
  z
    .string()
    .min(1)
    .regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  'expected non-empty tool name starting with a letter'
);

export const positiveIntegerSchema = defineConfigSchema(
  z.number().int().min(1).max(10_000),
  'expected positive integer'
);

export const nonNegativeIntegerSchema = defineConfigSchema(
  z.number().int().min(0).max(10_000),
  'expected non-negative integer'
);

export const stringArraySchema = defineConfigSchema(z.array(z.string()), 'expected string array');

export const stringRecordSchema = defineConfigSchema(
  z.record(z.string(), z.string()),
  'expected object with string values'
);

export const defaultConfig: PiTinyMcpConfig = {
  enabled: true,
  proxyTool: {
    enabled: true,
    name: 'mcp',
    includeSchemasInSearch: true,
  },
  directTools: {
    enabled: false,
    disableProxyTool: false,
  },
  metadataCache: {
    enabled: true,
    maxAgeHours: 168,
  },
  lifecycle: {
    defaultMode: 'lazy',
    idleTimeoutMinutes: 10,
    healthCheckSeconds: 30,
    startupConcurrency: 10,
  },
  toolNames: {
    prefix: 'server',
  },
  sources: {
    standardGlobal: true,
    standardProject: true,
  },
  servers: {},
};
