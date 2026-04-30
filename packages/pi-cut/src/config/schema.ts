export const DEFAULT_MAX_CHARS = 2000;
export const MIN_REPEATS = 2;
export const DEFAULT_MIN_LINE_REPEATS = 3;
export const DEFAULT_MIN_BLOCK_LINES = 4;
export const DEFAULT_MIN_BLOCK_REPEATS = MIN_REPEATS;
export const MIN_BLOCK_LINES = 3;
export const DEFAULT_EFFICIENCY_REMINDER_TEXT = [
  '<system_reminder>',
  'Minimize tool output, file reads, and irrelevant context, retaining only the data necessary to complete the current task.',
  '</system_reminder>',
].join('\n');

export interface PiCutConfig {
  enabled: boolean;
  terminalCleanup: TerminalCleanupConfig;
  repetitionFolding: RepetitionFoldingConfig;
  lineTruncation: LineTruncationConfig;
  efficiencyReminder: EfficiencyReminderConfig;
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

export interface RepetitionFoldingConfig {
  enabled: boolean;
  line: LineRepetitionFoldingConfig;
  block: BlockRepetitionFoldingConfig;
}

export interface LineRepetitionFoldingConfig {
  enabled: boolean;
  minRepeats: number;
}

export interface BlockRepetitionFoldingConfig {
  enabled: boolean;
  minLines: number;
  minRepeats: number;
}

export interface LineTruncationConfig {
  enabled: boolean;
  maxChars: number;
}

export interface EfficiencyReminderConfig {
  enabled: boolean;
  onEvery: number;
  text: string;
}

export type PartialTerminalCleanupConfig = Partial<{
  enabled: unknown;
  stripAnsi: unknown;
  collapseCarriageReturns: unknown;
  trimTrailingWhitespace: unknown;
}>;

export type PartialRepetitionFoldingConfig = Partial<{
  enabled: boolean;
  line: Partial<LineRepetitionFoldingConfig>;
  block: Partial<BlockRepetitionFoldingConfig>;
}>;

export type PartialLineTruncationConfig = Partial<{
  enabled: unknown;
  maxChars: unknown;
}>;

export type PartialEfficiencyReminderConfig = Partial<{
  enabled: unknown;
  onEvery: unknown;
  text: unknown;
}>;

export type PartialPiCutConfig = Partial<{
  enabled: unknown;
  terminalCleanup: PartialTerminalCleanupConfig;
  repetitionFolding: unknown;
  lineTruncation: PartialLineTruncationConfig;
  efficiencyReminder: PartialEfficiencyReminderConfig;
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
    line: {
      enabled: true,
      minRepeats: DEFAULT_MIN_LINE_REPEATS,
    },
    block: {
      enabled: true,
      minLines: DEFAULT_MIN_BLOCK_LINES,
      minRepeats: DEFAULT_MIN_BLOCK_REPEATS,
    },
  },
  lineTruncation: {
    enabled: true,
    maxChars: DEFAULT_MAX_CHARS,
  },
  efficiencyReminder: {
    enabled: true,
    onEvery: 1,
    text: DEFAULT_EFFICIENCY_REMINDER_TEXT,
  },
  tools: [],
};
