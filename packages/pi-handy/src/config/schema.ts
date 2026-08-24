import type { LoadedExtensionConfig } from '@trethore/shared/config/config-file.js';
import type { EnabledConfig, PartialEnabledConfig } from '@trethore/shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  showSysprompt: ShowSyspromptCommandConfig;
  timeTaken: TimeTakenFeatureConfig;
  noWebsocketCacheTtl: NoWebSocketCacheTtlFeatureConfig;
}

type ShowSyspromptCommandConfig = EnabledConfig;

type TimeTakenFeatureConfig = EnabledConfig;

type NoWebSocketCacheTtlFeatureConfig = EnabledConfig;

export type PartialPiHandyConfig = Partial<{
  enabled: unknown;
  showSysprompt: PartialEnabledConfig;
  timeTaken: PartialEnabledConfig;
  noWebsocketCacheTtl: PartialEnabledConfig;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiHandyConfig>;

export const defaultConfig: PiHandyConfig = {
  enabled: true,
  showSysprompt: {
    enabled: true,
  },
  timeTaken: {
    enabled: true,
  },
  noWebsocketCacheTtl: {
    enabled: false,
  },
};
