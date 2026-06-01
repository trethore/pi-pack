import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z, type EnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiToolboxConfig {
  enabled: boolean;
  eval: EvalToolConfig;
  findFiles: FindFilesToolConfig;
  grep: GrepToolConfig;
}

export interface EvalToolConfig extends EnabledConfig {
  defaultTimeoutMs: number;
  maxTimeoutMs?: number;
  node: RuntimeConfig;
  python: RuntimeConfig;
}

export interface RuntimeConfig extends EnabledConfig {
  command: string;
  args: string[];
}

export interface FindFilesToolConfig extends EnabledConfig {
  defaultLimit: number;
}

export interface GrepToolConfig extends EnabledConfig {
  defaultLimit: number;
  defaultLimitPerFile?: number;
  defaultMaxCharsPerMatch: number;
}

export type PartialPiToolboxConfig = Partial<{
  enabled: unknown;
  eval: Partial<{
    enabled: unknown;
    defaultTimeoutMs: unknown;
    maxTimeoutMs: unknown;
    node: Partial<{
      enabled: unknown;
      command: unknown;
      args: unknown;
    }>;
    python: Partial<{
      enabled: unknown;
      command: unknown;
      args: unknown;
    }>;
  }>;
  findFiles: Partial<{
    enabled: unknown;
    defaultLimit: unknown;
  }>;
  grep: Partial<{
    enabled: unknown;
    defaultLimit: unknown;
    defaultLimitPerFile: unknown;
    defaultMaxCharsPerMatch: unknown;
  }>;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiToolboxConfig>;

export const limitSchema = defineConfigSchema(
  z.number().int().min(1).max(1000),
  'expected integer between 1 and 1000'
);

export const maxCharsPerMatchSchema = defineConfigSchema(
  z.number().int().min(100).max(2000),
  'expected integer between 100 and 2000'
);

export const timeoutMsSchema = defineConfigSchema(
  z.number().int().min(1).max(3_600_000),
  'expected integer between 1 and 3600000'
);

export const commandSchema = defineConfigSchema(
  z.string().trim().min(1),
  'expected non-empty string'
);

export const stringArraySchema = defineConfigSchema(z.array(z.string()), 'expected string array');

export const defaultConfig: PiToolboxConfig = {
  enabled: true,
  eval: {
    enabled: true,
    defaultTimeoutMs: 10_000,
    node: {
      enabled: true,
      command: 'node',
      args: [],
    },
    python: {
      enabled: true,
      command: 'python3',
      args: [],
    },
  },
  findFiles: {
    enabled: true,
    defaultLimit: 100,
  },
  grep: {
    enabled: true,
    defaultLimit: 200,
    defaultMaxCharsPerMatch: 200,
  },
};
