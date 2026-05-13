import { defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';

export { booleanSchema as enabledSchema } from '@trethore/pi-shared/config/schema.js';

export type CodexVerbosity = 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'auto' | 'concise' | 'detailed';

export interface PiCodexifyConfig {
  enabled: boolean;
  codex: CodexControlsConfig;
  usage: CodexUsageConfig;
  account: CodexAccountConfig;
  webSearch: WebSearchConfig;
}

export interface CodexControlsConfig {
  enabled: boolean;
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
}

interface CodexUsageConfig {
  enabled: boolean;
}

interface CodexAccountConfig {
  enabled: boolean;
}

interface WebSearchConfig {
  enabled: boolean;
}

export type PartialPiCodexifyConfig = Partial<{
  enabled: unknown;
  codex: Partial<{
    enabled: unknown;
    verbosity: unknown;
    reasoningSummary: unknown;
  }>;
  usage: Partial<{
    enabled: unknown;
  }>;
  account: Partial<{
    enabled: unknown;
  }>;
  webSearch: Partial<{
    enabled: unknown;
  }>;
}>;

export interface LoadedConfig {
  config: PiCodexifyConfig;
  errors: string[];
}

export const defaultConfig: PiCodexifyConfig = {
  enabled: true,
  codex: {
    enabled: true,
  },
  usage: {
    enabled: true,
  },
  account: {
    enabled: true,
  },
  webSearch: {
    enabled: true,
  },
};

export const codexVerbosityValues = ['low', 'medium', 'high'] as const;
export const codexReasoningSummaryValues = ['auto', 'concise', 'detailed'] as const;

export const codexVerbositySchema = defineConfigSchema(
  z.enum(codexVerbosityValues).nullable(),
  'expected low, medium, high, or null'
);
export const codexReasoningSummarySchema = defineConfigSchema(
  z.enum(codexReasoningSummaryValues).nullable(),
  'expected auto, concise, detailed, or null'
);
