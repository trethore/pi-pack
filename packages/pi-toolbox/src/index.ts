import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import { registerEnabledFeatures, type ExtensionFeature } from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiToolboxConfig } from '#src/config/schema.js';
import { registerApplyPatchTool } from '#src/features/apply-patch/index.js';

const FEATURES: readonly ExtensionFeature<PiToolboxConfig>[] = [
  {
    isEnabled: (config) => config.enabled && config.applyPatch.enabled,
    register: registerApplyPatchTool,
  },
];

export default function piToolbox(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
