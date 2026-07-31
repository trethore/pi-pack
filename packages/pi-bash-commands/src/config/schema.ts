import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { z } from '@trethore/pi-shared/config/schema.js';

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

export interface PiBashCommandsConfig {
  enabled: boolean;
  commands: BashCommandConfig[];
}

export type PartialPiBashCommandsConfig = Partial<{
  enabled: unknown;
  commands: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiBashCommandsConfig>;

export const defaultConfig: PiBashCommandsConfig = {
  enabled: true,
  commands: [],
};

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
