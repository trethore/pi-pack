import type { LoadedExtensionConfig } from '@trethore/shared/config/config-file.js';
import type { EnabledConfig } from '@trethore/shared/config/schema.js';

export interface PiToolboxConfig {
  enabled: boolean;
  applyPatch: ApplyPatchToolConfig;
}

type ApplyPatchToolConfig = EnabledConfig;

export type LoadedConfig = LoadedExtensionConfig<PiToolboxConfig>;

export const defaultConfig: PiToolboxConfig = {
  enabled: true,
  applyPatch: {
    enabled: true,
  },
};
