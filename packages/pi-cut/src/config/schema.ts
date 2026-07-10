import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import type { EnabledConfig } from '@trethore/pi-shared/config/schema.js';

const DEFAULT_MAX_CHARS = 2000;
export const MIN_REPEATS = 2;
export const MIN_NEW_LINES = 2;
const DEFAULT_MIN_SAVED_LINES = 3;
const DEFAULT_MIN_SAVED_TOKENS = 40;
const DEFAULT_MAX_COMPARISONS = 250_000;
const DEFAULT_SAVINGS_MODE: SavingsMode = 'or';
const DEFAULT_MIN_NEW_LINES = 10;
const DEFAULT_FOLD_TO_NEW_LINES = 5;

export interface PiCutConfig {
  enabled: boolean;
  transformErrors: boolean;
  terminalCleanup: TerminalCleanupConfig;
  repetitionFolding: RepetitionFoldingConfig;
  newLinesFolding: NewLinesFoldingConfig;
  lineTruncation: LineTruncationConfig;
  tools: ToolOverrideConfig[];
}

export interface ResolvedToolConfig {
  enabled: boolean;
  transformErrors: boolean;
  terminalCleanup: TerminalCleanupConfig;
  repetitionFolding: RepetitionFoldingConfig;
  newLinesFolding: NewLinesFoldingConfig;
  lineTruncation: LineTruncationConfig;
}

export interface ToolOverrideConfig {
  selector: RegExp;
  enabled?: boolean;
  transformErrors?: boolean;
  terminalCleanup?: Partial<TerminalCleanupConfig>;
  repetitionFolding?: PartialRepetitionFoldingConfig;
  newLinesFolding?: Partial<NewLinesFoldingConfig>;
  lineTruncation?: Partial<LineTruncationConfig>;
}

export interface TerminalCleanupConfig extends EnabledConfig {
  stripAnsi: boolean;
  collapseCarriageReturns: boolean;
  trimTrailingWhitespace: boolean;
}

type SavingsMode = 'or' | 'and';

export interface RepetitionFoldingConfig extends EnabledConfig {
  minRepeats: number;
  minSavedLines: number;
  minSavedTokens: number;
  maxComparisons: number;
  savingsMode: SavingsMode;
}

export interface NewLinesFoldingConfig extends EnabledConfig {
  minNewLines: number;
  foldTo: number;
}

export interface LineTruncationConfig extends EnabledConfig {
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
  maxComparisons: number;
  savingsMode: SavingsMode;
}>;

type PartialLineTruncationConfig = Partial<{
  enabled: unknown;
  maxChars: unknown;
}>;

export type PartialPiCutConfig = Partial<{
  enabled: unknown;
  transformErrors: unknown;
  terminalCleanup: PartialTerminalCleanupConfig;
  repetitionFolding: unknown;
  newLinesFolding: unknown;
  lineTruncation: PartialLineTruncationConfig;
  tools: unknown;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiCutConfig>;

export const defaultConfig: PiCutConfig = {
  enabled: true,
  transformErrors: false,
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
    maxComparisons: DEFAULT_MAX_COMPARISONS,
    savingsMode: DEFAULT_SAVINGS_MODE,
  },
  newLinesFolding: {
    enabled: true,
    minNewLines: DEFAULT_MIN_NEW_LINES,
    foldTo: DEFAULT_FOLD_TO_NEW_LINES,
  },
  lineTruncation: {
    enabled: true,
    maxChars: DEFAULT_MAX_CHARS,
  },
  tools: [],
};
