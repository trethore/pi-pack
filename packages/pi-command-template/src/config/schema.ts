import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export const surfaceNames = ['system', 'appendSystem', 'contextFiles', 'promptTemplates', 'skills'] as const;

export type TemplateSurface = (typeof surfaceNames)[number];

type ExecutionCwd = 'workspace' | 'extension' | string;

export type TemplateCommand = string | string[];

export interface PiCommandTemplateConfig {
  enabled: boolean;
  surfaces: SurfaceConfig;
  execution: ExecutionConfig;
  templates: Record<string, TemplateCommand>;
}

export type SurfaceConfig = Record<TemplateSurface, boolean>;

interface ExecutionConfig {
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
    system: false,
    appendSystem: false,
    contextFiles: false,
    promptTemplates: false,
    skills: false,
  },
  execution: {
    timeoutMs: 3000,
    maxOutputChars: 20_000,
    cwd: 'workspace',
    shell: false,
  },
  templates: {},
};

export const positiveIntegerSchema = defineConfigSchema(z.number().int().positive(), 'expected positive integer');

export const cwdSchema = defineConfigSchema(z.string().min(1), 'expected non-empty string');

const templateCommandSchema = z.union([z.string(), z.tuple([z.string().min(1)]).rest(z.string())]);

export const templatesSchema = defineConfigSchema(
  z.record(z.string().regex(/^[A-Za-z0-9_-]+$/), templateCommandSchema),
  'expected object mapping template names to command strings or non-empty string arrays; names may contain letters, digits, underscores, and hyphens'
);
