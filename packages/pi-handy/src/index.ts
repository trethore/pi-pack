import type { ExtensionAPI } from '@mariozechner/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import {
  registerEnabledFeatures,
  type ExtensionFeature,
} from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiHandyConfig } from '#src/config/schema.js';
import { registerShowSyspromptCommand } from '#src/features/show-sysprompt/index.js';
import { registerSwitchWorkspaceCommand } from '#src/features/switch-workspace/index.js';
import { registerThinkingLevelCommand } from '#src/features/thinking-level/index.js';

const FEATURES: readonly ExtensionFeature<PiHandyConfig>[] = [
  {
    isEnabled: (config) => config.enabled && config.thinkingLevel.enabled,
    register: registerThinkingLevelCommand,
  },
  {
    isEnabled: (config) => config.enabled && config.switchWorkspace.enabled,
    register: registerSwitchWorkspaceCommand,
  },
  {
    isEnabled: (config) => config.enabled && config.showSysprompt.enabled,
    register: registerShowSyspromptCommand,
  },
];

export default function piHandy(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
