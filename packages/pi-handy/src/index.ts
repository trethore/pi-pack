import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/shared/config/diagnostics.js';
import { registerEnabledFeatures, type ExtensionFeature } from '@trethore/shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiHandyConfig } from '#src/config/schema.js';
import { registerShowSyspromptCommand } from '#src/features/show-sysprompt.js';
import { registerTimeTakenFeature } from '#src/features/time-taken.js';
import { registerNoWebSocketCacheTtlFeature } from '#src/features/no-websocket-cache-ttl.js';

const FEATURES: readonly ExtensionFeature<PiHandyConfig>[] = [
  {
    isEnabled: (config) => config.enabled && config.showSysprompt.enabled,
    register: registerShowSyspromptCommand,
  },
  {
    isEnabled: (config) => config.enabled && config.timeTaken.enabled,
    register: registerTimeTakenFeature,
  },
  {
    isEnabled: (config) => config.enabled && config.noWebsocketCacheTtl.enabled,
    register: registerNoWebSocketCacheTtlFeature,
  },
];

export default function piHandy(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeatures(pi, loadedConfig.config, FEATURES);
}
