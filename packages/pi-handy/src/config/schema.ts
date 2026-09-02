import type { LoadedExtensionConfig } from '@trethore/shared/config/config-file.js';
import type { EnabledConfig } from '@trethore/shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  showSysprompt: ShowSyspromptCommandConfig;
  timeTaken: TimeTakenFeatureConfig;
  noWebsocketCacheTtl: NoWebSocketCacheTtlFeatureConfig;
}

type ShowSyspromptCommandConfig = EnabledConfig;

type TimeTakenFeatureConfig = EnabledConfig;

type NoWebSocketCacheTtlFeatureConfig = EnabledConfig;

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
