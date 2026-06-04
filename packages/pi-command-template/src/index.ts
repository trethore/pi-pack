import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/pi-shared/config/diagnostics.js';
import { registerCommandTemplate } from '#src/command-template/index.js';
import { loadConfig } from '#src/config/config.js';
import { disableUnsafePiCommandTemplatePatch } from '#src/unsafe/index.js';

export default function piCommandTemplate(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);

  if (!loadedConfig.config.enabled) {
    disableUnsafePiCommandTemplatePatch();
    return;
  }

  registerCommandTemplate(pi, loadedConfig.config);
}
