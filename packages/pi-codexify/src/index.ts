import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { createActiveConfig } from '@trethore/pi-shared/config/active-config.js';

import { loadConfig } from '#src/config/config.js';
import { registerCodexifyCommand } from '#src/features/command/index.js';
import { registerProviderRequestMutations } from '#src/features/provider-request/index.js';

export default function piCodexify(pi: ExtensionAPI) {
  const activeConfig = createActiveConfig(pi, loadConfig);

  registerProviderRequestMutations(pi, () => activeConfig);
  registerCodexifyCommand(pi, activeConfig);
}
