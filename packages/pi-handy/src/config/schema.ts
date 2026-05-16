import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import type { EnabledConfig, PartialEnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  thinkingLevel: ThinkingLevelCommandConfig;
  switchWorkspace: SwitchWorkspaceCommandConfig;
  showSysprompt: ShowSyspromptCommandConfig;
  updatePi: UpdatePiCommandConfig;
}

type ThinkingLevelCommandConfig = EnabledConfig;

type SwitchWorkspaceCommandConfig = EnabledConfig;

type ShowSyspromptCommandConfig = EnabledConfig;

type UpdatePiCommandConfig = EnabledConfig;

export type PartialPiHandyConfig = Partial<{
  enabled: unknown;
  thinkingLevel: PartialEnabledConfig;
  switchWorkspace: PartialEnabledConfig;
  showSysprompt: PartialEnabledConfig;
  updatePi: PartialEnabledConfig;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiHandyConfig>;

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
  updatePi: {
    enabled: true,
  },
};
