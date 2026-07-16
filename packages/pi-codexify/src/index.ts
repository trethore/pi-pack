import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

import { loadConfig } from '#src/config/config.js';
import { registerCodexifyCommand } from '#src/features/command/index.js';
import { registerProviderRequestMutations } from '#src/features/provider-request/index.js';

export default function piCodexify(pi: ExtensionAPI) {
  const activeConfig = loadConfig(process.cwd(), { includeProject: false }).config;

  pi.on('session_start', (_event, ctx) => {
    const loadedConfig = loadConfig(ctx.cwd, { includeProject: ctx.isProjectTrusted() });
    Object.assign(activeConfig, loadedConfig.config);

    for (const error of loadedConfig.errors) ctx.ui.notify(error, 'warning');
  });

  registerProviderRequestMutations(pi, () => activeConfig);
  registerCodexifyCommand(pi, activeConfig);
}
