import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import {
  registerEnabledFeatures,
  type ExtensionFeature,
} from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiHandyConfig } from '#src/config/schema.js';
import { registerShowSyspromptCommand } from '#src/features/show-sysprompt/index.js';
import { registerThinkingLevelCommand } from '#src/features/thinking-level/index.js';
import { registerTimeTakenFeature } from '#src/features/time-taken/index.js';

const FEATURES: readonly ExtensionFeature<PiHandyConfig>[] = [
  {
    isEnabled: (config) => config.enabled && config.thinkingLevel.enabled,
    register: registerThinkingLevelCommand,
  },
  {
    isEnabled: (config) => config.enabled && config.showSysprompt.enabled,
    register: registerShowSyspromptCommand,
  },
  {
    isEnabled: (config) => config.enabled && config.timeTaken.enabled,
    register: registerTimeTakenFeature,
  },
];

export default function piHandy(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
