export const DEFAULT_MAX_CHARS = 2000;
export const DEFAULT_MIN_REPEATS = 3;

export interface PiCutConfig {
  enabled: boolean;
  terminalCleanup: TerminalCleanupConfig;
  duplicateLineFolding: DuplicateLineFoldingConfig;
  lineTruncation: LineTruncationConfig;
}

export interface TerminalCleanupConfig {
  enabled: boolean;
  stripAnsi: boolean;
  collapseCarriageReturns: boolean;
}

export interface DuplicateLineFoldingConfig {
  enabled: boolean;
  minRepeats: number;
}

export interface LineTruncationConfig {
  enabled: boolean;
  maxChars: number;
}

export type PartialPiCutConfig = Partial<{
  enabled: unknown;
  terminalCleanup: Partial<{
    enabled: unknown;
    stripAnsi: unknown;
    collapseCarriageReturns: unknown;
  }>;
  duplicateLineFolding: Partial<{
    enabled: unknown;
    minRepeats: unknown;
  }>;
  lineTruncation: Partial<{
    enabled: unknown;
    maxChars: unknown;
  }>;
}>;

export interface LoadedConfig {
  config: PiCutConfig;
  errors: string[];
}

export const defaultConfig: PiCutConfig = {
  enabled: true,
  terminalCleanup: {
    enabled: true,
    stripAnsi: true,
    collapseCarriageReturns: true,
  },
  duplicateLineFolding: {
    enabled: true,
    minRepeats: DEFAULT_MIN_REPEATS,
  },
  lineTruncation: {
    enabled: true,
    maxChars: DEFAULT_MAX_CHARS,
  },
};
