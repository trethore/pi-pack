import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import {
  registerEnabledFeatures,
  type ExtensionFeature,
} from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiToolboxConfig } from '#src/config/schema.js';
import { registerCustomEditTool } from '#src/features/custom-edit/index.js';
import { registerFindFilesTool } from '#src/features/find-files/index.js';
import { registerGrepTool } from '#src/features/grep/index.js';

const FEATURES: readonly ExtensionFeature<PiToolboxConfig>[] = [
  {
    isEnabled: (config) => config.enabled && config.findFiles.enabled,
    register: registerFindFilesTool,
  },
  {
    isEnabled: (config) => config.enabled && config.grep.enabled,
    register: registerGrepTool,
  },
  {
    isEnabled: (config) => config.enabled && config.customEdit.enabled,
    register: registerCustomEditTool,
  },
];

export default function piToolbox(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
