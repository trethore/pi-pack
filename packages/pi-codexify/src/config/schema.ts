import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import {
  defineConfigSchema,
  z,
  type EnabledConfig,
  type PartialEnabledConfig,
} from '@trethore/pi-shared/config/schema.js';

export type CodexVerbosity = 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'auto' | 'concise' | 'detailed';
export type OpenAICompactionReasoning = 'current' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

export interface PiCodexifyConfig {
  enabled: boolean;
  codex: CodexControlsConfig;
  usage: CodexUsageConfig;
  account: CodexAccountConfig;
  webSearch: WebSearchConfig;
  openaiCompaction: OpenAICompactionConfig;
}

export interface CodexControlsConfig extends EnabledConfig {
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
}

type CodexUsageConfig = EnabledConfig;

type CodexAccountConfig = EnabledConfig;

type WebSearchConfig = EnabledConfig;

export interface OpenAICompactionConfig extends EnabledConfig {
  model: string;
  reasoning: OpenAICompactionReasoning;
}

export type PartialPiCodexifyConfig = Partial<{
  enabled: unknown;
  codex: Partial<{
    enabled: unknown;
    verbosity: unknown;
    reasoningSummary: unknown;
  }>;
  usage: PartialEnabledConfig;
  account: PartialEnabledConfig;
  webSearch: PartialEnabledConfig;
  openaiCompaction: Partial<{
    enabled: unknown;
    model: unknown;
    reasoning: unknown;
  }>;
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
  webSearch: {
    enabled: true,
  },
  openaiCompaction: {
    enabled: false,
    model: 'gpt-5.5',
    reasoning: 'current',
  },
};

export const codexVerbosityValues = ['low', 'medium', 'high'] as const;
export const codexReasoningSummaryValues = ['auto', 'concise', 'detailed'] as const;
export const openaiCompactionReasoningValues = ['current', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const;

export const codexVerbositySchema = defineConfigSchema(
  z.enum(codexVerbosityValues).nullable(),
  'expected low, medium, high, or null'
);
export const codexReasoningSummarySchema = defineConfigSchema(
  z.enum(codexReasoningSummaryValues).nullable(),
  'expected auto, concise, detailed, or null'
);
export const openaiCompactionModelSchema = defineConfigSchema(z.string().min(1), 'expected a non-empty string');
export const openaiCompactionReasoningSchema = defineConfigSchema(
  z.enum(openaiCompactionReasoningValues),
  'expected current, minimal, low, medium, high, or xhigh'
);
