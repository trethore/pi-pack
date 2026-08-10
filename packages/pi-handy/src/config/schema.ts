import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import type { EnabledConfig, PartialEnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  implementationPrompt: ImplementationPromptFeatureConfig;
  thinkingLevel: ThinkingLevelCommandConfig;
  showSysprompt: ShowSyspromptCommandConfig;
  timeTaken: TimeTakenFeatureConfig;
}

export interface ImplementationPromptFeatureConfig extends EnabledConfig {
  message: string;
}

type ThinkingLevelCommandConfig = EnabledConfig;

type ShowSyspromptCommandConfig = EnabledConfig;

type TimeTakenFeatureConfig = EnabledConfig;

export type PartialPiHandyConfig = Partial<{
  enabled: unknown;
  implementationPrompt: PartialEnabledConfig & { message?: unknown };
  thinkingLevel: PartialEnabledConfig;
  showSysprompt: PartialEnabledConfig;
  timeTaken: PartialEnabledConfig;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiHandyConfig>;

export const defaultConfig: PiHandyConfig = {
  enabled: true,
  implementationPrompt: {
    enabled: true,
    message: 'Proceed with the implementation.',
  },
  thinkingLevel: {
    enabled: true,
  },
  showSysprompt: {
    enabled: true,
  },
  timeTaken: {
    enabled: true,
  },
};
