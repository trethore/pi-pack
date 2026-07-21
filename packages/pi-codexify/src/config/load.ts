import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { booleanSchema, createConfigMerger, defineConfigSchema, z } from '@trethore/pi-shared/config/schema.js';
import { getConfigPaths } from '#src/config/paths.js';
import {
  defaultConfig,
  reasoningSummaryValues,
  serviceTierValues,
  verbosityValues,
  type LoadedConfig,
  type PartialPiCodexifyConfig,
  type PiCodexifyConfig,
} from '#src/config/types.js';

const EXTENSION_NAME = 'pi-codexify';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);
const verbositySchema = defineConfigSchema(z.enum(verbosityValues).nullable(), 'expected low, medium, high, or null');
const reasoningSummarySchema = defineConfigSchema(
  z.enum(reasoningSummaryValues).nullable(),
  'expected auto, concise, detailed, none, or null'
);
const serviceTierSchema = defineConfigSchema(
  z.enum(serviceTierValues).nullable(),
  'expected default, priority, or null'
);

export function loadConfig(cwd: string, options: { includeProject?: boolean } = {}): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths: (configCwd) => getConfigPaths(configCwd, options.includeProject),
    createDefaultConfig: () => ({ ...defaultConfig, controls: { ...defaultConfig.controls } }),
    mergeConfig,
  });
}

function mergeConfig(target: PiCodexifyConfig, source: PartialPiCodexifyConfig, configPath: string, errors: string[]) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeField(source, 'usage', 'usage', booleanSchema, configPath, errors, (value) => {
    target.usage = value;
  });
  mergeField(source, 'reset', 'reset', booleanSchema, configPath, errors, (value) => {
    target.reset = value;
  });
  mergeSection(source, 'controls', configPath, errors, (controls) => {
    mergeControls(target, controls, configPath, errors);
  });
}

function mergeControls(
  target: PiCodexifyConfig,
  source: Record<string, unknown>,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target.controls, source, 'controls.enabled', configPath, errors);
  mergeField(source, 'webSearch', 'controls.webSearch', booleanSchema, configPath, errors, (value) => {
    target.controls.webSearch = value;
  });
  mergeField(source, 'verbosity', 'controls.verbosity', verbositySchema, configPath, errors, (value) => {
    target.controls.verbosity = value ?? undefined;
  });
  mergeField(
    source,
    'reasoningSummary',
    'controls.reasoningSummary',
    reasoningSummarySchema,
    configPath,
    errors,
    (value) => {
      target.controls.reasoningSummary = value ?? undefined;
    }
  );
  mergeField(source, 'serviceTier', 'controls.serviceTier', serviceTierSchema, configPath, errors, (value) => {
    target.controls.serviceTier = value ?? undefined;
  });
}
