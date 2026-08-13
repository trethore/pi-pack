import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export interface ExtensionFeature<TConfig> {
  isEnabled(config: TConfig): boolean;
  register(pi: ExtensionAPI, config: TConfig): void;
}

export interface ContextualExtensionFeature<TConfig, TContext> {
  isEnabled(config: TConfig): boolean;
  register(pi: ExtensionAPI, config: TConfig, context: TContext): void;
}

export function registerEnabledFeatures<TConfig>(
  pi: ExtensionAPI,
  config: TConfig,
  features: readonly ExtensionFeature<TConfig>[]
): void {
  for (const feature of features) {
    if (!feature.isEnabled(config)) continue;
    feature.register(pi, config);
  }
}

export function registerEnabledFeaturesWithContext<TConfig, TContext>(
  pi: ExtensionAPI,
  config: TConfig,
  features: readonly ContextualExtensionFeature<TConfig, TContext>[],
  context: TContext
): void {
  for (const feature of features) {
    if (!feature.isEnabled(config)) continue;
    feature.register(pi, config, context);
  }
}
