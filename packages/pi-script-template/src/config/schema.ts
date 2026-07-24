import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export const surfaceNames = ['system', 'appendSystem', 'contextFiles', 'promptTemplates', 'skills'] as const;

export type TemplateSurface = (typeof surfaceNames)[number];

export interface PiScriptTemplateConfig {
  enabled: boolean;
  surfaces: SurfaceConfig;
  execution: ExecutionConfig;
}

export type SurfaceConfig = Record<TemplateSurface, boolean>;

export interface ExecutionConfig {
  timeoutMs: number;
  maxOutputChars: number;
}

export type PartialPiScriptTemplateConfig = Partial<{
  enabled: unknown;
  surfaces: Partial<Record<TemplateSurface, unknown>>;
  execution: Partial<{
    timeoutMs: unknown;
    maxOutputChars: unknown;
  }>;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiScriptTemplateConfig>;

export const defaultConfig: PiScriptTemplateConfig = {
  enabled: true,
  surfaces: {
    system: false,
    appendSystem: false,
    contextFiles: false,
    promptTemplates: false,
    skills: false,
  },
  execution: {
    timeoutMs: 3000,
    maxOutputChars: 20_000,
  },
};

export const positiveIntegerSchema = defineConfigSchema(z.number().int().positive(), 'expected positive integer');
