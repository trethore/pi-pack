import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import { loadConfig } from '#src/config/config.js';
import { registerPromptCommand } from '#src/features/prompt-command/index.js';

export default function piPromptCommand(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  if (!loadedConfig.config.enabled) return;

  registerPromptCommand(pi, loadedConfig.config);
}
