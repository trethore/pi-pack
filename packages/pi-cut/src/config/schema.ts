const DEFAULT_MAX_CHARS = 2000;
export const MIN_REPEATS = 2;
const DEFAULT_MIN_SAVED_LINES = 3;
const DEFAULT_MIN_SAVED_TOKENS = 40;
const DEFAULT_SAVINGS_MODE: SavingsMode = 'or';
export interface PiCutConfig {
  enabled: boolean;
  terminalCleanup: TerminalCleanupConfig;
  repetitionFolding: RepetitionFoldingConfig;
  lineTruncation: LineTruncationConfig;
  tools: ToolOverrideConfig[];
}

export interface ResolvedToolConfig {
  enabled: boolean;
  terminalCleanup: TerminalCleanupConfig;
  repetitionFolding: RepetitionFoldingConfig;
  lineTruncation: LineTruncationConfig;
}

export interface ToolOverrideConfig {
  selector: RegExp;
  enabled?: boolean;
  terminalCleanup?: Partial<TerminalCleanupConfig>;
  repetitionFolding?: PartialRepetitionFoldingConfig;
  lineTruncation?: Partial<LineTruncationConfig>;
}

export interface TerminalCleanupConfig {
  enabled: boolean;
  stripAnsi: boolean;
  collapseCarriageReturns: boolean;
  trimTrailingWhitespace: boolean;
}

type SavingsMode = 'or' | 'and';

export interface RepetitionFoldingConfig {
  enabled: boolean;
  minRepeats: number;
  minSavedLines: number;
  minSavedTokens: number;
  savingsMode: SavingsMode;
}

export interface LineTruncationConfig {
  enabled: boolean;
  maxChars: number;
}

type PartialTerminalCleanupConfig = Partial<{
  enabled: unknown;
  stripAnsi: unknown;
  collapseCarriageReturns: unknown;
  trimTrailingWhitespace: unknown;
}>;

export type PartialRepetitionFoldingConfig = Partial<{
  enabled: boolean;
  minRepeats: number;
  minSavedLines: number;
  minSavedTokens: number;
  savingsMode: SavingsMode;
}>;

type PartialLineTruncationConfig = Partial<{
  enabled: unknown;
  maxChars: unknown;
}>;

export type PartialPiCutConfig = Partial<{
  enabled: unknown;
  terminalCleanup: PartialTerminalCleanupConfig;
  repetitionFolding: unknown;
  lineTruncation: PartialLineTruncationConfig;
  tools: unknown;
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
    trimTrailingWhitespace: true,
  },
  repetitionFolding: {
    enabled: true,
    minRepeats: MIN_REPEATS,
    minSavedLines: DEFAULT_MIN_SAVED_LINES,
    minSavedTokens: DEFAULT_MIN_SAVED_TOKENS,
    savingsMode: DEFAULT_SAVINGS_MODE,
  },
  lineTruncation: {
    enabled: true,
    maxChars: DEFAULT_MAX_CHARS,
  },
  tools: [],
};
