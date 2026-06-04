import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export type TemplateSurface =
  | 'system'
  | 'appendSystem'
  | 'contextFiles'
  | 'promptTemplates'
  | 'skills';

export type ExecutionCwd = 'workspace' | 'extension' | string;

export interface PiCommandTemplateConfig {
  enabled: boolean;
  surfaces: SurfaceConfig;
  execution: ExecutionConfig;
  templates: Record<string, string>;
}

export type SurfaceConfig = Record<TemplateSurface, boolean>;

export interface ExecutionConfig {
  timeoutMs: number;
  maxOutputChars: number;
  cwd: ExecutionCwd;
  shell: boolean;
}

export type PartialPiCommandTemplateConfig = Partial<{
  enabled: unknown;
  surfaces: Partial<Record<TemplateSurface, unknown>>;
  execution: Partial<{
    timeoutMs: unknown;
    maxOutputChars: unknown;
    cwd: unknown;
    shell: unknown;
  }>;
  templates: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiCommandTemplateConfig>;

export const defaultConfig: PiCommandTemplateConfig = {
  enabled: true,
  surfaces: {
    system: true,
    appendSystem: true,
    contextFiles: true,
    promptTemplates: true,
    skills: true,
  },
  execution: {
    timeoutMs: 3000,
    maxOutputChars: 20_000,
    cwd: 'workspace',
    shell: true,
  },
  templates: {},
};

export const surfaceNames = [
  'system',
  'appendSystem',
  'contextFiles',
  'promptTemplates',
  'skills',
] as const satisfies readonly TemplateSurface[];

export const positiveIntegerSchema = defineConfigSchema(
  z.number().int().positive(),
  'expected positive integer'
);

export const cwdSchema = defineConfigSchema(z.string().min(1), 'expected non-empty string');

export const templatesSchema = defineConfigSchema(
  z.record(z.string().regex(/^[A-Za-z0-9_-]+$/), z.string()),
  'expected object mapping template names to command strings; names may contain letters, digits, underscores, and hyphens'
);
