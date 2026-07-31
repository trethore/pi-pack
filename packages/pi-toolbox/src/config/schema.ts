import type { LoadedExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import type { EnabledConfig } from '@trethore/pi-shared/config/schema.js';

export interface PiToolboxConfig {
  enabled: boolean;
  applyPatch: ApplyPatchToolConfig;
}

type ApplyPatchToolConfig = EnabledConfig;

export type PartialPiToolboxConfig = Partial<{
  enabled: unknown;
  applyPatch: Partial<{
    enabled: unknown;
  }>;
}>;

export type LoadedConfig = LoadedExtensionConfig<PiToolboxConfig>;

export const defaultConfig: PiToolboxConfig = {
  enabled: true,
  applyPatch: {
    enabled: true,
  },
};
