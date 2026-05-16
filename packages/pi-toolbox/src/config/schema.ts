import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export { booleanSchema as enabledSchema } from '@trethore/pi-shared/config/schema.js';

export interface PiToolboxConfig {
  enabled: boolean;
  glob: GlobToolConfig;
}

export interface GlobToolConfig {
  enabled: boolean;
  defaultLimit: number;
}

export type PartialPiToolboxConfig = Partial<{
  enabled: unknown;
  glob: Partial<{
    enabled: unknown;
    defaultLimit: unknown;
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

export const defaultConfig: PiToolboxConfig = {
  enabled: true,
  glob: {
    enabled: true,
    defaultLimit: 100,
  },
};
