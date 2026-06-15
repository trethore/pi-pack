import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import {
  defineConfigSchema,
  z,
  type EnabledConfig,
  type PartialEnabledConfig,
} from '@trethore/pi-shared/config/schema.js';

export type CodexVerbosity = 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'auto' | 'concise' | 'detailed';

export interface PiCodexifyConfig {
  enabled: boolean;
  codex: CodexControlsConfig;
  usage: CodexUsageConfig;
  account: CodexAccountConfig;
  reset: CodexResetConfig;
  webSearch: WebSearchConfig;
}

export interface CodexControlsConfig extends EnabledConfig {
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
}

type CodexUsageConfig = EnabledConfig;

type CodexAccountConfig = EnabledConfig;

type CodexResetConfig = EnabledConfig;

type WebSearchConfig = EnabledConfig;

export type PartialPiCodexifyConfig = Partial<{
  enabled: unknown;
  codex: Partial<{
    enabled: unknown;
    verbosity: unknown;
    reasoningSummary: unknown;
  }>;
  usage: PartialEnabledConfig;
  account: PartialEnabledConfig;
  reset: PartialEnabledConfig;
  webSearch: PartialEnabledConfig;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiCodexifyConfig>;

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
  reset: {
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
