export const DEFAULT_MAX_CHARS = 2000;

export interface PiCutConfig {
  enabled: boolean;
  lineTruncation: LineTruncationConfig;
}

export interface LineTruncationConfig {
  enabled: boolean;
  maxChars: number;
}

export type PartialPiCutConfig = Partial<{
  enabled: unknown;
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
  lineTruncation: {
    enabled: true,
    maxChars: DEFAULT_MAX_CHARS,
  },
};
