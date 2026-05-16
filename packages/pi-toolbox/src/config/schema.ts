import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export { booleanSchema as enabledSchema } from '@trethore/pi-shared/config/schema.js';

export interface PiToolboxConfig {
  enabled: boolean;
  glob: GlobToolConfig;
  grep: GrepToolConfig;
}

export interface GlobToolConfig {
  enabled: boolean;
  defaultLimit: number;
}

export interface GrepToolConfig {
  enabled: boolean;
  defaultLimit: number;
  defaultLimitPerFile?: number;
  defaultMaxCharsPerMatch: number;
}

export type PartialPiToolboxConfig = Partial<{
  enabled: unknown;
  glob: Partial<{
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

export interface LoadedConfig {
  config: PiToolboxConfig;
  errors: string[];
}

export const limitSchema = defineConfigSchema(
  z.number().int().min(1).max(1000),
  'expected integer between 1 and 1000'
);

export const maxCharsPerMatchSchema = defineConfigSchema(
  z.number().int().min(100).max(2000),
  'expected integer between 100 and 2000'
);

export const defaultConfig: PiToolboxConfig = {
  enabled: true,
  glob: {
    enabled: true,
    defaultLimit: 100,
  },
  grep: {
    enabled: true,
    defaultLimit: 200,
    defaultMaxCharsPerMatch: 200,
  },
};
