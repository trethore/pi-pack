import type { LoadedExtensionConfig } from '@trethore/shared/config/config-file.js';
import { defineConfigSchema, z } from '@trethore/shared/config/schema.js';

import { LIMIT_RANGE, MAX_CHARS_PER_MATCH_RANGE } from '#src/cli/shared/limits.js';
import {
  DEFAULT_FIND_CLI_DEFAULTS,
  DEFAULT_GREP_CLI_DEFAULTS,
  type FindCliDefaults,
  type GrepCliDefaults,
} from '#src/cli/shared/defaults.js';

interface BashCommandPromptConfig {
  description?: string;
  usage?: string;
}

export interface BashCommandConfig {
  enabled: boolean;
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  prompt?: BashCommandPromptConfig;
}

export interface PiFindBuiltInConfig extends FindCliDefaults {
  enabled: boolean;
}

export interface PiGrepBuiltInConfig extends GrepCliDefaults {
  enabled: boolean;
}

export interface BuiltInsConfig {
  'pi-find': PiFindBuiltInConfig;
  'pi-grep': PiGrepBuiltInConfig;
}

export interface PiBashCommandsConfig {
  enabled: boolean;
  builtIns: BuiltInsConfig;
  commands: BashCommandConfig[];
}

export type PartialPiBashCommandsConfig = Partial<{
  enabled: unknown;
  builtIns: unknown;
  commands: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiBashCommandsConfig>;

export const defaultConfig: PiBashCommandsConfig = {
  enabled: true,
  builtIns: {
    'pi-find': {
      enabled: true,
      ...DEFAULT_FIND_CLI_DEFAULTS,
    },
    'pi-grep': {
      enabled: true,
      ...DEFAULT_GREP_CLI_DEFAULTS,
    },
  },
  commands: [],
};

export const limitSchema = defineConfigSchema(
  z.number().int().min(LIMIT_RANGE.minimum).max(LIMIT_RANGE.maximum),
  `expected integer between ${LIMIT_RANGE.minimum} and ${LIMIT_RANGE.maximum}`
);

export const maxCharsPerMatchSchema = defineConfigSchema(
  z.number().int().min(MAX_CHARS_PER_MATCH_RANGE.minimum).max(MAX_CHARS_PER_MATCH_RANGE.maximum),
  `expected integer between ${MAX_CHARS_PER_MATCH_RANGE.minimum} and ${MAX_CHARS_PER_MATCH_RANGE.maximum}`
);

const promptSchema = z
  .object({
    description: z.string().optional(),
    usage: z.string().optional(),
  })
  .transform((prompt): BashCommandPromptConfig | undefined => {
    const description = normalizePromptField(prompt.description);
    const usage = normalizePromptField(prompt.usage);
    return description || usage ? { description, usage } : undefined;
  });

export const bashCommandSchema = z.object({
  enabled: z.boolean().default(true),
  name: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]*$/),
  command: z
    .string()
    .min(1)
    .refine((command) => !command.includes('\0')),
  args: z.array(z.string().refine((argument) => !argument.includes('\0'))).default([]),
  env: z
    .record(
      z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/),
      z.string().refine((value) => !value.includes('\0'))
    )
    .default({}),
  prompt: promptSchema.optional(),
});

function normalizePromptField(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
