import { readBooleanField } from '@trethore/pi-shared/config/field.js';
import { readJsoncConfigFile } from '@trethore/pi-shared/config/config-file.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import { getConfigPaths } from '#src/config/locations.js';
import {
  codexReasoningSummaryValues,
  codexVerbosityValues,
  defaultConfig,
  type CodexReasoningSummary,
  type CodexVerbosity,
  type LoadedConfig,
  type PartialPiCodexifyConfig,
  type PiCodexifyConfig,
} from '#src/config/schema.js';

export function loadConfig(cwd: string): LoadedConfig {
  const errors: string[] = [];
  const mergedConfig = cloneDefaultConfig();

  for (const configPath of getConfigPaths(cwd)) {
    const parsedConfig = readConfigFile(configPath, errors);
    if (parsedConfig) mergeConfig(mergedConfig, parsedConfig, configPath, errors);
  }

  return { config: mergedConfig, errors };
}

function cloneDefaultConfig(): PiCodexifyConfig {
  return {
    ...defaultConfig,
    codex: { ...defaultConfig.codex },
    usage: { ...defaultConfig.usage },
    webSearch: { ...defaultConfig.webSearch },
  };
}

function readConfigFile(configPath: string, errors: string[]): PartialPiCodexifyConfig | undefined {
  return readJsoncConfigFile<PartialPiCodexifyConfig>(configPath, 'pi-codexify', errors);
}

function mergeConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.enabled !== undefined) {
    const enabled = readPiCodexifyBooleanField(source.enabled, 'enabled', configPath, errors);
    if (enabled !== undefined) target.enabled = enabled;
  }

  mergeCodexConfig(target, source, configPath, errors);
  mergeUsageConfig(target, source, configPath, errors);
  mergeWebSearchConfig(target, source, configPath, errors);
}

function mergeCodexConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.codex === undefined) return;

  if (!isRecord(source.codex)) {
    errors.push(
      `pi-codexify config ignored invalid codex value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.codex.enabled !== undefined) {
    const enabled = readPiCodexifyBooleanField(
      source.codex.enabled,
      'codex.enabled',
      configPath,
      errors
    );
    if (enabled !== undefined) target.codex.enabled = enabled;
  }

  if (source.codex.verbosity !== undefined) {
    if (source.codex.verbosity === null) {
      target.codex.verbosity = undefined;
    } else if (isCodexVerbosity(source.codex.verbosity)) {
      target.codex.verbosity = source.codex.verbosity;
    } else {
      errors.push(
        `pi-codexify config ignored invalid codex.verbosity value in ${configPath}; expected low, medium, high, or null.`
      );
    }
  }

  mergeReasoningSummaryConfig(target, source.codex, configPath, errors);
}

function mergeReasoningSummaryConfig(
  target: PiCodexifyConfig,
  codexConfig: Record<string, unknown>,
  configPath: string,
  errors: string[]
) {
  if (codexConfig.reasoningSummary === undefined) return;

  if (codexConfig.reasoningSummary === null) {
    target.codex.reasoningSummary = undefined;
    return;
  }

  if (isCodexReasoningSummary(codexConfig.reasoningSummary)) {
    target.codex.reasoningSummary = codexConfig.reasoningSummary;
    return;
  }

  errors.push(
    `pi-codexify config ignored invalid codex.reasoningSummary value in ${configPath}; expected auto, concise, detailed, or null.`
  );
}

function mergeUsageConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.usage === undefined) return;

  if (!isRecord(source.usage)) {
    errors.push(
      `pi-codexify config ignored invalid usage value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.usage.enabled !== undefined) {
    const enabled = readPiCodexifyBooleanField(
      source.usage.enabled,
      'usage.enabled',
      configPath,
      errors
    );
    if (enabled !== undefined) target.usage.enabled = enabled;
  }
}

function mergeWebSearchConfig(
  target: PiCodexifyConfig,
  source: PartialPiCodexifyConfig,
  configPath: string,
  errors: string[]
) {
  if (source.webSearch === undefined) return;

  if (!isRecord(source.webSearch)) {
    errors.push(
      `pi-codexify config ignored invalid webSearch value in ${configPath}; expected object.`
    );
    return;
  }

  if (source.webSearch.enabled !== undefined) {
    const enabled = readPiCodexifyBooleanField(
      source.webSearch.enabled,
      'webSearch.enabled',
      configPath,
      errors
    );
    if (enabled !== undefined) target.webSearch.enabled = enabled;
  }
}

function readPiCodexifyBooleanField(
  value: unknown,
  label: string,
  configPath: string,
  errors: string[]
): boolean | undefined {
  return readBooleanField(value, 'pi-codexify', label, configPath, errors);
}

function isCodexVerbosity(value: unknown): value is CodexVerbosity {
  return codexVerbosityValues.includes(value as CodexVerbosity);
}

function isCodexReasoningSummary(value: unknown): value is CodexReasoningSummary {
  return codexReasoningSummaryValues.includes(value as CodexReasoningSummary);
}
