import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import type { EnabledConfig, PartialEnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  thinkingLevel: ThinkingLevelCommandConfig;
  showSysprompt: ShowSyspromptCommandConfig;
  dumpSessionHistory: DumpSessionHistoryCommandConfig;
  timeTaken: TimeTakenFeatureConfig;
}

type ThinkingLevelCommandConfig = EnabledConfig;

type ShowSyspromptCommandConfig = EnabledConfig;

type DumpSessionHistoryCommandConfig = EnabledConfig;

type TimeTakenFeatureConfig = EnabledConfig;

export type PartialPiHandyConfig = Partial<{
  enabled: unknown;
  thinkingLevel: PartialEnabledConfig;
  showSysprompt: PartialEnabledConfig;
  dumpSessionHistory: PartialEnabledConfig;
  timeTaken: PartialEnabledConfig;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiHandyConfig>;

export const defaultConfig: PiHandyConfig = {
  enabled: true,
  thinkingLevel: {
    enabled: true,
  },
  showSysprompt: {
    enabled: true,
  },
  dumpSessionHistory: {
    enabled: true,
  },
  timeTaken: {
    enabled: true,
  },
};
