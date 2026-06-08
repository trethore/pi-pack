import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import { booleanSchema, createConfigMerger } from '@trethore/pi-shared/config/schema.js';
import { isRecord } from '@trethore/pi-shared/object.js';

import { getConfigPaths } from '#src/config/locations.js';
import { loadStandardMcpServers } from '#src/config/mcp-files.js';
import {
  defaultConfig,
  lifecycleModeSchema,
  nonNegativeIntegerSchema,
  positiveIntegerSchema,
  serverAuthSchema,
  stringArraySchema,
  stringRecordSchema,
  stringSchema,
  toolNameSchema,
  toolPrefixSchema,
  type LoadedConfig,
  type PartialPiTinyMcpConfig,
  type PiTinyMcpConfig,
  type ServerConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-tiny-mcp';
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  const loadedConfig = loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
  const standardMcp = loadStandardMcpServers(
    cwd,
    loadedConfig.config.sources.standardGlobal,
    loadedConfig.config.sources.standardProject
  );

  const config = {
    ...loadedConfig.config,
    servers: mergeServerMaps(standardMcp.servers, loadedConfig.config.servers),
  };
  const errors = [...loadedConfig.errors, ...standardMcp.errors];
  validateServerDefinitions(config, errors);

  return { config, errors };
}

function mergeServerMaps(
  standardServers: Record<string, ServerConfig>,
  piServers: Record<string, ServerConfig>
): Record<string, ServerConfig> {
  const merged = { ...standardServers };
  for (const [serverName, definition] of Object.entries(piServers)) {
    merged[serverName] = { ...merged[serverName], ...definition };
  }
  return merged;
}

function validateServerDefinitions(config: PiTinyMcpConfig, errors: string[]): void {
  for (const [serverName, definition] of Object.entries(config.servers)) {
    if (definition.command || definition.url) continue;
    errors.push(`${EXTENSION_NAME} config ignored invalid servers.${serverName}; command or url is required.`);
    delete config.servers[serverName];
  }
}

function cloneDefaultConfig(): PiTinyMcpConfig {
  return {
    ...defaultConfig,
    proxyTool: { ...defaultConfig.proxyTool },
    directTools: { ...defaultConfig.directTools },
    metadataCache: { ...defaultConfig.metadataCache },
    lifecycle: { ...defaultConfig.lifecycle },
    toolNames: { ...defaultConfig.toolNames },
    sources: { ...defaultConfig.sources },
    servers: {},
  };
}

function mergeConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeProxyToolConfig(target, source, configPath, errors);
  mergeDirectToolsConfig(target, source, configPath, errors);
  mergeMetadataCacheConfig(target, source, configPath, errors);
  mergeLifecycleConfig(target, source, configPath, errors);
  mergeToolNamesConfig(target, source, configPath, errors);
  mergeSourcesConfig(target, source, configPath, errors);
  mergeServersConfig(target, source, configPath, errors);
}

function mergeProxyToolConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeSection(source, 'proxyTool', configPath, errors, (section, label) => {
    mergeEnabledField(target.proxyTool, section, `${label}.enabled`, configPath, errors);
    mergeField(section, 'name', `${label}.name`, toolNameSchema, configPath, errors, (value) => {
      target.proxyTool.name = value;
    });
    mergeBooleanField(
      section,
      'includeSchemasInSearch',
      `${label}.includeSchemasInSearch`,
      configPath,
      errors,
      (value) => {
        target.proxyTool.includeSchemasInSearch = value;
      }
    );
  });
}

function mergeDirectToolsConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeSection(source, 'directTools', configPath, errors, (section, label) => {
    mergeEnabledField(target.directTools, section, `${label}.enabled`, configPath, errors);
    mergeBooleanField(section, 'disableProxyTool', `${label}.disableProxyTool`, configPath, errors, (value) => {
      target.directTools.disableProxyTool = value;
    });
  });
}

function mergeMetadataCacheConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeSection(source, 'metadataCache', configPath, errors, (section, label) => {
    mergeEnabledField(target.metadataCache, section, `${label}.enabled`, configPath, errors);
    mergeField(
      section,
      'maxAgeHours',
      `${label}.maxAgeHours`,
      nonNegativeIntegerSchema,
      configPath,
      errors,
      (value) => {
        target.metadataCache.maxAgeHours = value;
      }
    );
  });
}

function mergeLifecycleConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeSection(source, 'lifecycle', configPath, errors, (section, label) => {
    mergeField(section, 'defaultMode', `${label}.defaultMode`, lifecycleModeSchema, configPath, errors, (value) => {
      target.lifecycle.defaultMode = value;
    });
    mergeField(
      section,
      'idleTimeoutMinutes',
      `${label}.idleTimeoutMinutes`,
      nonNegativeIntegerSchema,
      configPath,
      errors,
      (value) => {
        target.lifecycle.idleTimeoutMinutes = value;
      }
    );
    mergeField(
      section,
      'healthCheckSeconds',
      `${label}.healthCheckSeconds`,
      positiveIntegerSchema,
      configPath,
      errors,
      (value) => {
        target.lifecycle.healthCheckSeconds = value;
      }
    );
    mergeField(
      section,
      'startupConcurrency',
      `${label}.startupConcurrency`,
      positiveIntegerSchema,
      configPath,
      errors,
      (value) => {
        target.lifecycle.startupConcurrency = value;
      }
    );
  });
}

function mergeToolNamesConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeSection(source, 'toolNames', configPath, errors, (section, label) => {
    mergeField(section, 'prefix', `${label}.prefix`, toolPrefixSchema, configPath, errors, (value) => {
      target.toolNames.prefix = value;
    });
  });
}

function mergeSourcesConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  mergeSection(source, 'sources', configPath, errors, (section, label) => {
    mergeBooleanField(section, 'standardGlobal', `${label}.standardGlobal`, configPath, errors, (value) => {
      target.sources.standardGlobal = value;
    });
    mergeBooleanField(section, 'standardProject', `${label}.standardProject`, configPath, errors, (value) => {
      target.sources.standardProject = value;
    });
  });
}

function mergeServersConfig(
  target: PiTinyMcpConfig,
  source: PartialPiTinyMcpConfig,
  configPath: string,
  errors: string[]
): void {
  if (source.servers === undefined) return;
  if (!isRecord(source.servers)) {
    errors.push(`${EXTENSION_NAME} config ignored invalid servers value in ${configPath}; expected object.`);
    return;
  }

  for (const [serverName, value] of Object.entries(source.servers)) {
    if (!isRecord(value)) {
      errors.push(
        `${EXTENSION_NAME} config ignored invalid servers.${serverName} value in ${configPath}; expected object.`
      );
      continue;
    }
    target.servers[serverName] = mergeServerConfig(
      target.servers[serverName] ?? {},
      value,
      `servers.${serverName}`,
      configPath,
      errors
    );
  }
}

function mergeServerConfig(
  target: ServerConfig,
  source: Record<string, unknown>,
  label: string,
  configPath: string,
  errors: string[]
): ServerConfig {
  const next = { ...target };
  mergeStringField(source, 'command', `${label}.command`, configPath, errors, (value) => {
    next.command = value;
  });
  mergeField(source, 'args', `${label}.args`, stringArraySchema, configPath, errors, (value) => {
    next.args = value;
  });
  mergeField(source, 'env', `${label}.env`, stringRecordSchema, configPath, errors, (value) => {
    next.env = value;
  });
  mergeStringField(source, 'cwd', `${label}.cwd`, configPath, errors, (value) => {
    next.cwd = value;
  });
  mergeStringField(source, 'url', `${label}.url`, configPath, errors, (value) => {
    next.url = value;
  });
  mergeField(source, 'headers', `${label}.headers`, stringRecordSchema, configPath, errors, (value) => {
    next.headers = value;
  });
  mergeField(source, 'auth', `${label}.auth`, serverAuthSchema, configPath, errors, (value) => {
    next.auth = value;
  });
  mergeStringField(source, 'bearerToken', `${label}.bearerToken`, configPath, errors, (value) => {
    next.bearerToken = value;
  });
  mergeStringField(source, 'bearerTokenEnv', `${label}.bearerTokenEnv`, configPath, errors, (value) => {
    next.bearerTokenEnv = value;
  });
  mergeField(source, 'lifecycle', `${label}.lifecycle`, lifecycleModeSchema, configPath, errors, (value) => {
    next.lifecycle = value;
  });
  mergeField(
    source,
    'idleTimeoutMinutes',
    `${label}.idleTimeoutMinutes`,
    nonNegativeIntegerSchema,
    configPath,
    errors,
    (value) => {
      next.idleTimeoutMinutes = value;
    }
  );
  mergeBooleanField(source, 'exposeResources', `${label}.exposeResources`, configPath, errors, (value) => {
    next.exposeResources = value;
  });
  mergeBooleanField(source, 'directTools', `${label}.directTools`, configPath, errors, (value) => {
    next.directTools = value;
  });
  mergeField(source, 'excludeTools', `${label}.excludeTools`, stringArraySchema, configPath, errors, (value) => {
    next.excludeTools = value;
  });
  mergeBooleanField(source, 'debug', `${label}.debug`, configPath, errors, (value) => {
    next.debug = value;
  });
  return next;
}

function mergeStringField(
  source: Record<string, unknown>,
  field: string,
  label: string,
  configPath: string,
  errors: string[],
  apply: (value: string) => void
): void {
  mergeField(source, field, label, stringSchema, configPath, errors, apply);
}

function mergeBooleanField(
  source: Record<string, unknown>,
  field: string,
  label: string,
  configPath: string,
  errors: string[],
  apply: (value: boolean) => void
): void {
  mergeField(source, field, label, booleanSchema, configPath, errors, apply);
}
