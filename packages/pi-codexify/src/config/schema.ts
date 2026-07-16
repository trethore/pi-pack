import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import {
  defineConfigSchema,
  z,
  type EnabledConfig,
  type PartialEnabledConfig,
} from '@trethore/pi-shared/config/schema.js';

export type CodexVerbosity = 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'auto' | 'concise' | 'detailed' | 'none';
export type CodexServiceTier = 'default' | 'priority';

export interface PiCodexifyConfig {
  enabled: boolean;
  codex: CodexControlsConfig;
  usage: CodexUsageConfig;
  reset: CodexResetConfig;
  webSearch: WebSearchConfig;
}

export interface CodexControlsConfig extends EnabledConfig {
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
  serviceTier?: CodexServiceTier;
}

type CodexUsageConfig = EnabledConfig;

type CodexResetConfig = EnabledConfig;

type WebSearchConfig = EnabledConfig;

export type PartialPiCodexifyConfig = Partial<{
  enabled: unknown;
  codex: Partial<{
    enabled: unknown;
    verbosity: unknown;
    reasoningSummary: unknown;
    serviceTier: unknown;
  }>;
  usage: PartialEnabledConfig;
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
  reset: {
    enabled: true,
  },
  webSearch: {
    enabled: true,
  },
};

export const codexVerbosityValues = ['low', 'medium', 'high'] as const;
export const codexReasoningSummaryValues = ['auto', 'concise', 'detailed', 'none'] as const;
export const codexServiceTierValues = ['default', 'priority'] as const;

export const codexVerbositySchema = defineConfigSchema(
  z.enum(codexVerbosityValues).nullable(),
  'expected low, medium, high, or null'
);
export const codexReasoningSummarySchema = defineConfigSchema(
  z.enum(codexReasoningSummaryValues).nullable(),
  'expected auto, concise, detailed, none, or null'
);
export const codexServiceTierSchema = defineConfigSchema(
  z.enum(codexServiceTierValues).nullable(),
  'expected default, priority, or null'
);
