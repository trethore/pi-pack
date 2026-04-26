export type CodexVerbosity = 'low' | 'medium' | 'high';
export type CodexReasoningSummary = 'auto' | 'concise' | 'detailed';

export interface PiCodexifyConfig {
  enabled: boolean;
  codex: CodexControlsConfig;
  usage: CodexUsageConfig;
  webSearch: WebSearchConfig;
}

export interface CodexControlsConfig {
  enabled: boolean;
  verbosity?: CodexVerbosity;
  reasoningSummary?: CodexReasoningSummary;
}

export interface CodexUsageConfig {
  enabled: boolean;
}

export interface WebSearchConfig {
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
  webSearch: {
    enabled: true,
  },
};

export const codexVerbosityValues = ['low', 'medium', 'high'] as const;
export const codexReasoningSummaryValues = ['auto', 'concise', 'detailed'] as const;
