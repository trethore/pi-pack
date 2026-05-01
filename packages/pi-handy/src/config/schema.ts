export interface PiHandyConfig {
  enabled: boolean;
  thinkingLevel: ThinkingLevelCommandConfig;
  switchWorkspace: SwitchWorkspaceCommandConfig;
}

export interface ThinkingLevelCommandConfig {
  enabled: boolean;
}

export interface SwitchWorkspaceCommandConfig {
  enabled: boolean;
}

export type PartialPiHandyConfig = Partial<{
  enabled: unknown;
  thinkingLevel: Partial<{
    enabled: unknown;
  }>;
  switchWorkspace: Partial<{
    enabled: unknown;
  }>;
}>;

export interface LoadedConfig {
  config: PiHandyConfig;
  errors: string[];
}

export const defaultConfig: PiHandyConfig = {
  enabled: true,
  thinkingLevel: {
    enabled: true,
  },
  switchWorkspace: {
    enabled: true,
  },
};
