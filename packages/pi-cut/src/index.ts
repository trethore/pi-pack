import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { loadConfig } from '#src/config/config.js';
import { registerToolResultPipeline } from '#src/features/tool-result-pipeline.js';

export default function piCut(pi: ExtensionAPI) {
  const activeConfig = loadConfig(process.cwd(), { includeProject: false }).config;

  pi.on('session_start', (_event, ctx) => {
    const loadedConfig = loadConfig(ctx.cwd, { includeProject: ctx.isProjectTrusted() });
    Object.assign(activeConfig, loadedConfig.config);

    for (const error of loadedConfig.errors) ctx.ui.notify(error, 'warning');
  });

  registerToolResultPipeline(pi, activeConfig);
}
