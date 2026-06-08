import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import { registerEnabledFeatures, type ExtensionFeature } from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiCutConfig } from '#src/config/schema.js';
import { registerToolResultPipeline } from '#src/features/tool-result-pipeline.js';

const FEATURES: readonly ExtensionFeature<PiCutConfig>[] = [
  {
    isEnabled: (config) => config.enabled,
    register: registerToolResultPipeline,
  },
];

export default function piCut(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
