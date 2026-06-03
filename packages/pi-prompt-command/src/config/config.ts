import { loadJsoncExtensionConfig } from '@trethore/pi-shared/config/config-file.js';
import {
  booleanSchema,
  createConfigMerger,
  defineConfigSchema,
  z,
} from '@trethore/pi-shared/config/schema.js';
import { isRecord } from '@trethore/pi-shared/object.js';
import { getConfigPaths } from '#src/config/locations.js';
import {
  defaultConfig,
  type LoadedConfig,
  type PartialPiPromptCommandConfig,
  type PermissionDecision,
  type PiPromptCommandConfig,
  type PromptCommandSurfacesConfig,
} from '#src/config/schema.js';

const EXTENSION_NAME = 'pi-prompt-command';
const SURFACE_KEYS: Array<keyof PromptCommandSurfacesConfig> = [
  'system',
  'appendSystem',
  'promptTemplates',
  'contextFiles',
  'skills',
];
const positiveIntegerSchema = defineConfigSchema(
  z.number().int().min(1),
  'expected integer greater than or equal to 1'
);
const cwdSchema = defineConfigSchema(z.string().min(1), 'expected non-empty string');
const { mergeEnabledField, mergeField, mergeSection } = createConfigMerger(EXTENSION_NAME);

export function loadConfig(cwd: string): LoadedConfig {
  return loadJsoncExtensionConfig({
    cwd,
    extensionName: EXTENSION_NAME,
    getConfigPaths,
    createDefaultConfig: cloneDefaultConfig,
    mergeConfig,
  });
}

function cloneDefaultConfig(): PiPromptCommandConfig {
  return {
    ...defaultConfig,
    surfaces: { ...defaultConfig.surfaces },
    permissions: { ...defaultConfig.permissions },
  };
}

function mergeConfig(
  target: PiPromptCommandConfig,
  source: PartialPiPromptCommandConfig,
  configPath: string,
  errors: string[]
) {
  mergeEnabledField(target, source, 'enabled', configPath, errors);
  mergeField(
    source,
    'timeoutMs',
    'timeoutMs',
    positiveIntegerSchema,
    configPath,
    errors,
    (value) => {
      target.timeoutMs = value;
    }
  );
  mergeField(
    source,
    'maxOutputBytes',
    'maxOutputBytes',
    positiveIntegerSchema,
    configPath,
    errors,
    (value) => {
      target.maxOutputBytes = value;
    }
  );
  mergeField(source, 'cwd', 'cwd', cwdSchema, configPath, errors, (value) => {
    target.cwd = value;
  });
  mergeSection(source, 'surfaces', configPath, errors, (section, sectionName) => {
    mergeSurfaces(target.surfaces, section, sectionName, configPath, errors);
  });
  mergePermissions(target, source.permissions, configPath, errors);
}

function mergeSurfaces(
  target: PromptCommandSurfacesConfig,
  source: Record<string, unknown>,
  sectionName: string,
  configPath: string,
  errors: string[]
) {
  for (const key of SURFACE_KEYS) {
    mergeField(source, key, `${sectionName}.${key}`, booleanSchema, configPath, errors, (value) => {
      target[key] = value;
    });
  }
}

function mergePermissions(
  target: PiPromptCommandConfig,
  value: unknown,
  configPath: string,
  errors: string[]
) {
  if (value === undefined) return;

  if (!isRecord(value)) {
    errors.push(
      `${EXTENSION_NAME} config ignored invalid permissions value in ${configPath}; expected object.`
    );
    return;
  }

  const permissions: Record<string, PermissionDecision> = {};
  for (const [pattern, decision] of Object.entries(value)) {
    if (!isPermissionDecision(decision)) {
      errors.push(
        `${EXTENSION_NAME} config ignored invalid permissions.${pattern} value in ${configPath}; expected "allow" or "deny".`
      );
      continue;
    }
    permissions[pattern] = decision;
  }

  target.permissions = permissions;
}

function isPermissionDecision(value: unknown): value is PermissionDecision {
  return value === 'allow' || value === 'deny';
}
