import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { registerConfigDiagnostics } from '@trethore/shared/config/diagnostics.js';

import { loadConfig } from '#src/config/config.js';
import { registerWorkingMessage } from '#src/core/working-message.js';

export default function piWhimsical(pi: ExtensionAPI) {
  const loadedConfig = loadConfig(process.cwd());

  registerConfigDiagnostics(pi, loadedConfig.errors);
  registerWorkingMessage(pi, loadedConfig.config);
}
