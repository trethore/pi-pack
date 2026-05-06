export { booleanSchema as enabledSchema } from '@trethore/pi-shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  thinkingLevel: ThinkingLevelCommandConfig;
  switchWorkspace: SwitchWorkspaceCommandConfig;
  showSysprompt: ShowSyspromptCommandConfig;
}

interface ThinkingLevelCommandConfig {
  enabled: boolean;
}

interface SwitchWorkspaceCommandConfig {
  enabled: boolean;
}

interface ShowSyspromptCommandConfig {
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
  showSysprompt: Partial<{
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
  showSysprompt: {
    enabled: true,
  },
};
