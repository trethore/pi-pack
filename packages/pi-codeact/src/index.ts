import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import { registerEnabledFeatures, type ExtensionFeature } from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiCodeactConfig } from '#src/config/schema.js';
import { registerExecuteCodeTool } from '#src/features/execute_code/index.js';

const FEATURES: readonly ExtensionFeature<PiCodeactConfig>[] = [
  {
    isEnabled: (config) => config.enabled && config.executeCode.enabled,
    register: registerExecuteCodeTool,
  },
];

export default function piCodeact(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
