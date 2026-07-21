import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createActiveConfig } from '@trethore/pi-shared/config/active-config.js';

import { registerCommand } from '#src/command/register.js';
import { loadConfig } from '#src/config/load.js';
import { registerProviderRequest } from '#src/provider-request.js';

export default function piCodexify(pi: ExtensionAPI) {
  const activeConfig = createActiveConfig(pi, loadConfig);

  registerProviderRequest(pi, () => activeConfig);
  registerCommand(pi, activeConfig);
}
