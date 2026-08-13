import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import type { EnabledConfig, PartialEnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiHandyConfig {
  enabled: boolean;
  thinkingLevel: ThinkingLevelCommandConfig;
  showSysprompt: ShowSyspromptCommandConfig;
  timeTaken: TimeTakenFeatureConfig;
  websocketCacheTtl: WebSocketCacheTtlFeatureConfig;
}

type ThinkingLevelCommandConfig = EnabledConfig;

type ShowSyspromptCommandConfig = EnabledConfig;

type TimeTakenFeatureConfig = EnabledConfig;

export interface WebSocketCacheTtlFeatureConfig extends EnabledConfig {
  ttlMinutes: number;
}

export type PartialPiHandyConfig = Partial<{
  enabled: unknown;
  thinkingLevel: PartialEnabledConfig;
  showSysprompt: PartialEnabledConfig;
  timeTaken: PartialEnabledConfig;
  websocketCacheTtl: Partial<{
    enabled: unknown;
    ttlMinutes: unknown;
  }>;
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
  timeTaken: {
    enabled: true,
  },
  websocketCacheTtl: {
    enabled: false,
    ttlMinutes: 30,
  },
};
