import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';

export const verbosityValues = ['low', 'medium', 'high'] as const;
export const reasoningSummaryValues = ['auto', 'concise', 'detailed', 'none'] as const;
export const serviceTierValues = ['default', 'priority'] as const;

export type CodexVerbosity = (typeof verbosityValues)[number];
export type CodexReasoningSummary = (typeof reasoningSummaryValues)[number];
export type CodexServiceTier = (typeof serviceTierValues)[number];

export interface ControlsConfig {
  enabled: boolean;
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
  serviceTier?: CodexServiceTier;
  webSearch: boolean;
}

export interface PiCodexifyConfig {
  enabled: boolean;
  controls: ControlsConfig;
  usage: boolean;
  reset: boolean;
}

export type PartialPiCodexifyConfig = Partial<{
  enabled: unknown;
  controls: Partial<{
    enabled: unknown;
    verbosity: unknown;
    reasoningSummary: unknown;
    serviceTier: unknown;
    webSearch: unknown;
  }>;
  usage: unknown;
  reset: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiCodexifyConfig>;

export const defaultConfig: PiCodexifyConfig = {
  enabled: true,
  controls: {
    enabled: true,
    webSearch: true,
  },
  usage: true,
  reset: true,
};
