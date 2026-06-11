import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import {
  registerEnabledFeaturesWithContext,
  type ContextualExtensionFeature,
} from '@trethore/pi-shared/features/registry.js';
import { loadConfig } from '#src/config/config.js';
import type { PiCodexifyConfig } from '#src/config/schema.js';
import { registerCodexifyCommand } from '#src/features/command/index.js';
import { registerCodexAccountSync } from '#src/features/accounts/index.js';
import { type CodexControlsController, registerCodexControls } from '#src/features/codex-controls/index.js';
import { registerWebSearch } from '#src/features/web-search/index.js';

interface CodexifyRuntime {
  codexControls?: CodexControlsController;
}

const FEATURES: readonly ContextualExtensionFeature<PiCodexifyConfig, CodexifyRuntime>[] = [
  {
    isEnabled: (config) => config.enabled && config.codex.enabled,
    register(pi, config, runtime) {
      runtime.codexControls = registerCodexControls(pi, config.codex);
    },
  },
  {
    isEnabled: (config) => config.enabled && config.webSearch.enabled,
    register(pi, config) {
      registerWebSearch(pi, config.webSearch);
    },
  },
  {
    isEnabled: (config) => config.enabled && config.account.enabled,
    register(pi) {
      registerCodexAccountSync(pi);
    },
  },
  {
    isEnabled: (config) => config.enabled,
    register(pi, config, runtime) {
      registerCodexifyCommand(pi, config, runtime.codexControls);
    },
  },
];

export default function piCodexify(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());
  const runtime: CodexifyRuntime = {};

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerEnabledFeaturesWithContext(pi, loadedConfig.config, FEATURES, runtime);
}
