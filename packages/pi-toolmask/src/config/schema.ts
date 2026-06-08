import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export interface PiToolmaskConfig {
  enabled: boolean;
  masks: string[];
  enforceBeforeAgentStart: boolean;
  notify: boolean;
}

export type PartialPiToolmaskConfig = Partial<{
  enabled: unknown;
  masks: unknown;
  enforceBeforeAgentStart: unknown;
  notify: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiToolmaskConfig>;

export const defaultConfig: PiToolmaskConfig = {
  enabled: true,
  masks: [],
  enforceBeforeAgentStart: true,
  notify: false,
};

export const stringArraySchema = defineConfigSchema(z.array(z.string().min(1)), 'expected array of non-empty strings');
