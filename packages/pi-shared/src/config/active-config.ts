import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

interface LoadedConfig<TConfig> {
  config: TConfig;
  errors: string[];
}

type ConfigLoader<TConfig> = (cwd: string, options?: { includeProject?: boolean }) => LoadedConfig<TConfig>;

export function createActiveConfig<TConfig extends object>(
  pi: ExtensionAPI,
  loadConfig: ConfigLoader<TConfig>
): TConfig {
  const activeConfig = loadConfig(process.cwd(), { includeProject: false }).config;

  pi.on('session_start', (_event, ctx) => {
    const loadedConfig = loadConfig(ctx.cwd, { includeProject: ctx.isProjectTrusted() });
    Object.assign(activeConfig, loadedConfig.config);

    for (const error of loadedConfig.errors) ctx.ui.notify(error, 'warning');
  });

  return activeConfig;
}
