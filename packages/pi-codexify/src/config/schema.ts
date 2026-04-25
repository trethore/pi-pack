export type CodexVerbosity = 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'auto' | 'concise' | 'detailed' | 'none';

export interface PiCodexifyConfig {
  enabled: boolean;
  codex: CodexControlsConfig;
  usage: CodexUsageConfig;
}

export interface CodexControlsConfig {
  enabled: boolean;
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
}

export interface CodexUsageConfig {
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
};

export const codexVerbosityValues = ['low', 'medium', 'high'] as const;
export const codexReasoningSummaryValues = ['auto', 'concise', 'detailed', 'none'] as const;
