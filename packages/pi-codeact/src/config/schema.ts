import { homedir } from 'node:os';
import path from 'node:path';

import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z, type EnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiCodeactConfig {
  enabled: boolean;
  executeCode: ExecuteCodeConfig;
}

export interface ExecuteCodeConfig extends EnabledConfig {
  packageCachePath: string;
  defaultTimeoutSeconds: number;
}

export type PartialPiCodeactConfig = Partial<{
  enabled: unknown;
  executeCode: Partial<{
    enabled: unknown;
    packageCachePath: unknown;
    defaultTimeoutSeconds: unknown;
  }>;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiCodeactConfig>;

export const packageCachePathSchema = defineConfigSchema(z.string().trim().min(1), 'expected non-empty string');

export const timeoutSecondsSchema = defineConfigSchema(
  z.number().int().min(1),
  'expected integer greater than or equal to 1'
);

export const defaultConfig: PiCodeactConfig = {
  enabled: true,
  executeCode: {
    enabled: true,
    packageCachePath: path.join(homedir(), '.cache', 'pi-codeact', 'packages'),
    defaultTimeoutSeconds: 30,
  },
};
